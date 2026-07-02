import * as ts from 'typescript';

export interface SymbolNode {
  id: string;
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'enum';
  file: string;
  folder: string;
  isExport: boolean;
  hasUnknownDynamicImport?: boolean;
}

export interface SymbolEdge {
  source: string;
  target: string;
  sourceFile: string;
  targetFile: string;
  type: 'import' | 'wildcard' | 're-export' | 'intra-file' | 'dynamic';
  label: string;
  sourceSymbolType?: 'function' | 'module';
}

export interface SymbolData {
  nodes: SymbolNode[];
  edges: SymbolEdge[];
}

export interface FileData {
  path: string;
  content: string;
}

export function extractImports(content: string): {
  imports: string[];
  symbols: string[];
  wildcardImports: string[];
  importMap: Map<string, string[]>;
  reExports: { module: string; symbols: string[] }[];
  dynamicImports: { module: string; isStringLiteral: boolean; containingFunction?: string }[];
} {
  const sourceFile = ts.createSourceFile('temp.ts', content, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  const symbols: string[] = [];
  const wildcardImports: string[] = [];
  const importMap = new Map<string, string[]>();
  const reExports: { module: string; symbols: string[] }[] = [];
  const dynamicImports: { module: string; isStringLiteral: boolean; containingFunction?: string }[] = [];
  const symbolToModule = new Map<string, string>(); // Track imports for re-export detection
  let currentFunction: string | undefined;

  function visit(node: ts.Node) {
    // Track which function we're currently in
    if (ts.isFunctionDeclaration(node) && node.name) {
      const prevFunction = currentFunction;
      currentFunction = node.name.text;
      ts.forEachChild(node, visit);
      currentFunction = prevFunction;
      return;
    }

    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, '');
      imports.push(moduleSpecifier);

      if (node.importClause && node.importClause.namedBindings) {
        if (ts.isNamedImports(node.importClause.namedBindings)) {
          const importedSymbols: string[] = [];
          node.importClause.namedBindings.elements.forEach((element) => {
            symbols.push(element.name.text);
            importedSymbols.push(element.name.text);
            symbolToModule.set(element.name.text, moduleSpecifier);
          });
          importMap.set(moduleSpecifier, importedSymbols);
        } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          wildcardImports.push(moduleSpecifier);
          importMap.set(moduleSpecifier, []);
        }
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      // Handle direct re-exports: export { a, b } from './module'
      const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, '');
      const exportedSymbols: string[] = [];
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((element) => {
          exportedSymbols.push(element.name.text);
        });
      }
      reExports.push({ module: moduleSpecifier, symbols: exportedSymbols });
    } else if (
      ts.isExportDeclaration(node) &&
      !node.moduleSpecifier &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      // Handle re-exports of imported symbols: export { x } (where x was imported)
      node.exportClause.elements.forEach((element) => {
        const sourceModule = symbolToModule.get(element.name.text);
        if (sourceModule) {
          reExports.push({ module: sourceModule, symbols: [element.name.text] });
        }
      });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      // Handle dynamic imports: import('./module')
      if (node.arguments.length > 0) {
        const arg = node.arguments[0];
        let moduleSpecifier = '';
        let isStringLiteral = false;

        if (ts.isStringLiteral(arg)) {
          moduleSpecifier = arg.text;
          isStringLiteral = true;
        } else if (ts.isNoSubstitutionTemplateLiteral(arg)) {
          moduleSpecifier = arg.text;
          isStringLiteral = true;
        } else {
          // Template literal with expressions or variable - not analyzable
          moduleSpecifier = arg.getText();
          isStringLiteral = false;
        }

        dynamicImports.push({ module: moduleSpecifier, isStringLiteral, containingFunction: currentFunction });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { imports, symbols, wildcardImports, importMap, reExports, dynamicImports };
}

export function extractSymbolsFromFile(content: string, filePath: string): SymbolNode[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const symbols: SymbolNode[] = [];
  const symbolCounts = new Map<string, number>();

  function getUniqueId(baseName: string): string {
    const count = symbolCounts.get(baseName) || 0;
    symbolCounts.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}-${count}`;
  }

  function isTopLevel(node: ts.Node): boolean {
    return node.parent === sourceFile;
  }

  const pathParts = filePath.split('/');
  const fileName = pathParts[pathParts.length - 1];
  const folder = pathParts.slice(0, -1).join('/');

  function getBaseId(symbolName: string): string {
    if (folder === '') {
      return `${fileName}.${symbolName}`;
    }
    return `${folder}/${fileName}.${symbolName}`;
  }

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const baseId = getBaseId(node.name.text);
      symbols.push({
        id: getUniqueId(baseId),
        name: node.name.text,
        type: 'function',
        file: fileName,
        folder,
        isExport: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false,
      });
    } else if (ts.isClassDeclaration(node) && node.name) {
      const baseId = getBaseId(node.name.text);
      symbols.push({
        id: getUniqueId(baseId),
        name: node.name.text,
        type: 'class',
        file: fileName,
        folder,
        isExport: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false,
      });
    } else if (ts.isVariableStatement(node) && isTopLevel(node)) {
      node.declarationList.declarations.forEach((decl) => {
        if (ts.isIdentifier(decl.name)) {
          const baseId = getBaseId(decl.name.text);
          symbols.push({
            id: getUniqueId(baseId),
            name: decl.name.text,
            type: 'variable',
            file: fileName,
            folder,
            isExport: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false,
          });
        }
      });
    } else if (ts.isVariableStatement(node) && !isTopLevel(node)) {
      // Extract non-top-level variables only if they are used in dynamic imports
      // Skip function-local variables to avoid clutter
      // Only extract if they're at module level (not inside functions/classes)
      const parent = node.parent;
      if (parent && !ts.isFunctionDeclaration(parent) && !ts.isClassDeclaration(parent) && !ts.isBlock(parent)) {
        node.declarationList.declarations.forEach((decl) => {
          if (ts.isIdentifier(decl.name)) {
            const baseId = getBaseId(decl.name.text);
            symbols.push({
              id: getUniqueId(baseId),
              name: decl.name.text,
              type: 'variable',
              file: fileName,
              folder,
              isExport: false,
            });
          }
        });
      }
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      const baseId = getBaseId(node.name.text);
      symbols.push({
        id: getUniqueId(baseId),
        name: node.name.text,
        type: 'interface',
        file: fileName,
        folder,
        isExport: true,
      });
    } else if (ts.isTypeAliasDeclaration(node) && node.name) {
      const baseId = getBaseId(node.name.text);
      symbols.push({
        id: getUniqueId(baseId),
        name: node.name.text,
        type: 'type',
        file: fileName,
        folder,
        isExport: true,
      });
    } else if (ts.isEnumDeclaration(node) && node.name) {
      const baseId = getBaseId(node.name.text);
      symbols.push({
        id: getUniqueId(baseId),
        name: node.name.text,
        type: 'enum',
        file: fileName,
        folder,
        isExport: true,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}

export function buildSymbolGraphFromFiles(files: FileData[]): SymbolData {
  const allSymbols: SymbolNode[] = [];
  const fileToSymbols = new Map<string, SymbolNode[]>();
  const fileToReExports = new Map<string, { module: string; symbols: string[] }[]>();
  const edges: SymbolEdge[] = [];

  // Extract symbols from all files
  files.forEach((file) => {
    const symbols = extractSymbolsFromFile(file.content, file.path);
    allSymbols.push(...symbols);
    fileToSymbols.set(file.path, symbols);
  });

  // Extract re-exports from all files
  files.forEach((file) => {
    const { reExports } = extractImports(file.content);
    if (reExports.length > 0) {
      fileToReExports.set(file.path, reExports);
    }
  });

  // Helper to resolve re-exports to actual symbol IDs
  function resolveReExportedSymbols(
    filePath: string,
    symbolNames: string[],
    dirPath: string
  ): { symbols: SymbolNode[]; isReExport: boolean } {
    const reExports = fileToReExports.get(filePath);
    if (!reExports) return { symbols: [], isReExport: false };

    const resolvedSymbols: SymbolNode[] = [];

    reExports.forEach((reExport) => {
      const modulePath = reExport.module;
      let resolvedPath: string;

      if (modulePath.startsWith('.')) {
        const parts = modulePath.split('/');
        const basePath = dirPath ? dirPath.split('/') : [];
        parts.forEach((part) => {
          if (part === '..') {
            basePath.pop();
          } else if (part !== '.') {
            basePath.push(part);
          }
        });
        resolvedPath = basePath.join('/');
      } else {
        return; // Skip external
      }

      const targetPath =
        resolvedPath.endsWith('.ts') || resolvedPath.endsWith('.tsx') ? resolvedPath : `${resolvedPath}.ts`;

      // Try index file fallback
      let targetSymbols = fileToSymbols.get(targetPath);
      if (!targetSymbols && !targetPath.endsWith('/index.ts')) {
        const indexPath = targetPath.replace(/\.ts$/, '/index.ts');
        targetSymbols = fileToSymbols.get(indexPath);
      }

      if (targetSymbols) {
        const symbolsToExport =
          reExport.symbols.length === 0
            ? targetSymbols.filter((s) => symbolNames.includes(s.name)) // Re-export all, but filter by requested names
            : targetSymbols.filter((s) => reExport.symbols.includes(s.name) && symbolNames.includes(s.name));

        resolvedSymbols.push(...symbolsToExport);
      }
    });

    return { symbols: resolvedSymbols, isReExport: resolvedSymbols.length > 0 };
  }

  // Build edges from file-level dependencies
  const edgeKeyCount = new Map<string, number>();

  files.forEach((file) => {
    const sourceSymbols = fileToSymbols.get(file.path);
    if (!sourceSymbols) return;

    const { imports, wildcardImports, importMap, dynamicImports } = extractImports(file.content);
    const allImports = [...imports, ...wildcardImports];

    // Handle dynamic imports
    dynamicImports.forEach((dynamicImport) => {
      if (dynamicImport.isStringLiteral) {
        // String literal dynamic import - treat as normal import
        const importPath = dynamicImport.module;
        const dirPath = file.path.split('/').slice(0, -1).join('/');
        let resolvedPath: string;

        if (importPath.startsWith('.')) {
          const parts = importPath.split('/');
          const basePath = dirPath ? dirPath.split('/') : [];
          parts.forEach((part) => {
            if (part === '..') {
              basePath.pop();
            } else if (part !== '.') {
              basePath.push(part);
            }
          });
          resolvedPath = basePath.join('/');
        } else {
          return; // Skip external imports
        }

        const targetPath =
          resolvedPath.endsWith('.ts') || resolvedPath.endsWith('.tsx') ? resolvedPath : `${resolvedPath}.ts`;

        let targetSymbols = fileToSymbols.get(targetPath);
        if (!targetSymbols && !targetPath.endsWith('/index.ts')) {
          const indexPath = targetPath.replace(/\.ts$/, '/index.ts');
          targetSymbols = fileToSymbols.get(indexPath);
        }

        if (!targetSymbols) return;

        const targetExports = targetSymbols.filter((s) => s.isExport);

        // If inside a function, only connect that function
        if (dynamicImport.containingFunction) {
          const sourceSymbol = sourceSymbols.find((s) => s.name === dynamicImport.containingFunction);
          if (sourceSymbol) {
            targetExports.forEach((targetSymbol) => {
              const edgeKey = `${sourceSymbol.id}-${targetSymbol.id}`;
              if (!edgeKeyCount.has(edgeKey)) {
                edges.push({
                  source: sourceSymbol.id,
                  target: targetSymbol.id,
                  sourceFile: file.path.split('/').pop() || '',
                  targetFile: targetPath.split('/').pop() || '',
                  type: 'dynamic',
                  label: 'dynamic import',
                  sourceSymbolType: 'function', // Mark as symbol-level
                });
                edgeKeyCount.set(edgeKey, 1);
              }
            });
          }
        } else {
          // Top-level dynamic import - connect all symbols in the file (exported and non-exported)
          sourceSymbols.forEach((sourceSymbol) => {
            targetExports.forEach((targetSymbol) => {
              const edgeKey = `${sourceSymbol.id}-${targetSymbol.id}`;
              if (!edgeKeyCount.has(edgeKey)) {
                edges.push({
                  source: sourceSymbol.id,
                  target: targetSymbol.id,
                  sourceFile: file.path.split('/').pop() || '',
                  targetFile: targetPath.split('/').pop() || '',
                  type: 'dynamic',
                  label: 'dynamic import',
                  sourceSymbolType: 'module', // Mark as module-level
                });
                edgeKeyCount.set(edgeKey, 1);
              }
            });
          });
        }
      } else {
        // Non-string-literal dynamic import
        if (dynamicImport.containingFunction) {
          // Mark only the containing function
          const sourceSymbol = sourceSymbols.find((s) => s.name === dynamicImport.containingFunction);
          if (sourceSymbol) {
            sourceSymbol.hasUnknownDynamicImport = true;
          }
        } else {
          // Top-level - mark all exported symbols in the file
          sourceSymbols.forEach((symbol) => {
            if (symbol.isExport) {
              symbol.hasUnknownDynamicImport = true;
            }
          });
        }
      }
    });

    allImports.forEach((importPath: string) => {
      // Resolve import path relative to file
      const dirPath = file.path.split('/').slice(0, -1).join('/');
      let resolvedPath: string;

      if (importPath.startsWith('.')) {
        // Relative import
        const parts = importPath.split('/');
        const basePath = dirPath ? dirPath.split('/') : [];
        parts.forEach((part) => {
          if (part === '..') {
            basePath.pop();
          } else if (part !== '.') {
            basePath.push(part);
          }
        });
        resolvedPath = basePath.join('/');
      } else {
        // Skip external imports (node_modules, etc.)
        return;
      }

      const targetPath =
        resolvedPath.endsWith('.ts') || resolvedPath.endsWith('.tsx') ? resolvedPath : `${resolvedPath}.ts`;

      let targetSymbols = fileToSymbols.get(targetPath);
      let actualTargetPath = targetPath;
      // Try index file if direct file not found
      if (!targetSymbols && !targetPath.endsWith('/index.ts')) {
        const indexPath = targetPath.replace(/\.ts$/, '/index.ts');
        targetSymbols = fileToSymbols.get(indexPath);
        if (targetSymbols) {
          actualTargetPath = indexPath;
        }
      }

      if (!targetSymbols) return;

      const targetExports = targetSymbols.filter((s) => s.isExport);
      const importedSymbolNames = importMap.get(importPath) || [];
      const isWildcard = importedSymbolNames.length === 0 && wildcardImports.includes(importPath);

      // Also treat as wildcard if no named imports are specified (could be default import or namespace import)
      const shouldConnectAll = isWildcard || importedSymbolNames.length === 0;

      let targetSymbolsToConnect = shouldConnectAll
        ? targetExports
        : targetExports.filter((s) => importedSymbolNames.includes(s.name));

      // For named imports that don't match directly, try resolving through re-exports
      let reExportedSymbols: SymbolNode[] = [];
      if (!shouldConnectAll && importedSymbolNames.length > 0) {
        const unmatchedSymbols = importedSymbolNames.filter(
          (name) => !targetSymbolsToConnect.some((s) => s.name === name)
        );
        if (unmatchedSymbols.length > 0) {
          // Calculate dirPath from the target file (where re-exports are defined)
          const targetDirPath = actualTargetPath.split('/').slice(0, -1).join('/');
          const reExportResult = resolveReExportedSymbols(actualTargetPath, unmatchedSymbols, targetDirPath);
          if (reExportResult.symbols.length > 0) {
            reExportedSymbols = reExportResult.symbols;
            targetSymbolsToConnect = [...targetSymbolsToConnect, ...reExportedSymbols];
          }
        }
      }

      sourceSymbols.forEach((sourceSymbol) => {
        targetSymbolsToConnect.forEach((targetSymbol) => {
          const edgeKey = `${sourceSymbol.id}-${targetSymbol.id}`;
          if (!edgeKeyCount.has(edgeKey)) {
            let edgeType: 'import' | 'wildcard' | 're-export' = shouldConnectAll ? 'wildcard' : 'import';
            let edgeLabel = shouldConnectAll ? 'namespace import' : 'named import';
            // Mark as re-export if this symbol came from re-export resolution
            if (reExportedSymbols.includes(targetSymbol)) {
              edgeType = 're-export';
              edgeLabel = 're-export';
            }
            edges.push({
              source: sourceSymbol.id,
              target: targetSymbol.id,
              sourceFile: file.path.split('/').pop() || '',
              targetFile: targetPath.split('/').pop() || '',
              type: edgeType,
              label: edgeLabel,
            });
            edgeKeyCount.set(edgeKey, 1);
          }
        });
      });
    });
  });
  console.log('===============================');

  // Add intra-file bidirectional edges
  fileToSymbols.forEach((symbols, filePath) => {
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symbol1 = symbols[i];
        const symbol2 = symbols[j];

        const edgeKey1 = `${symbol1.id}-${symbol2.id}`;
        const edgeKey2 = `${symbol2.id}-${symbol1.id}`;

        if (!edgeKeyCount.has(edgeKey1)) {
          edges.push({
            source: symbol1.id,
            target: symbol2.id,
            sourceFile: filePath.split('/').pop() || '',
            targetFile: filePath.split('/').pop() || '',
            type: 'intra-file',
            label: 'file',
          });
          edgeKeyCount.set(edgeKey1, 1);
        }

        if (!edgeKeyCount.has(edgeKey2)) {
          edges.push({
            source: symbol2.id,
            target: symbol1.id,
            sourceFile: filePath.split('/').pop() || '',
            targetFile: filePath.split('/').pop() || '',
            type: 'intra-file',
            label: 'file',
          });
          edgeKeyCount.set(edgeKey2, 1);
        }
      }
    }
  });

  console.log('=== Symbol Graph Data ===');
  console.log(`Total symbols: ${allSymbols.length}`);
  console.log(`Total edges: ${edges.length}`);
  console.log('Sample symbols:', allSymbols.slice(0, 5));
  console.log('Sample edges:', edges.slice(0, 5));
  console.log('========================');

  return { nodes: allSymbols, edges };
}
