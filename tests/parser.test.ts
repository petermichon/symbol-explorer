import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { parseFilesMinimal, buildGraphFromMinimal, FileData } from "../src/browserParser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");
const testDir = join(__dirname, "..", "test-codebase", "src");

function collectFiles(dir: string): FileData[] {
  const files: FileData[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full));
    } else if (extname(full) === ".ts" || extname(full) === ".tsx") {
      files.push({ path: full.replace(testDir + "/", ""), content: readFileSync(full, "utf-8") });
    }
  }
  return files;
}

const files = collectFiles(testDir);
const data = parseFilesMinimal(files);
const graph = buildGraphFromMinimal(data);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", msg);
  }
}

function assertEqual(actual: any, expected: any, msg: string) {
  assert(actual === expected, `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertIncludes(arr: any[], item: any, msg: string) {
  assert(arr.includes(item), `${msg}: expected to include ${JSON.stringify(item)}, got ${JSON.stringify(arr)}`);
}

function assertEdgeVia(sourceId: string, targetId: string, expectedVia: string[], msg: string) {
  const edge = graph.edges.find((e: any) => e.source === sourceId && e.target === targetId);
  assert(!!edge, `${msg}: edge exists`);
  if (edge) {
    const actual = edge.via || [];
    assert(
      JSON.stringify(actual) === JSON.stringify(expectedVia),
      `${msg}: expected via ${JSON.stringify(expectedVia)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// --- Test: re-export-test.ts ---
const reExportModule = data.modules.find((m) => m.id.endsWith("re-export-test.ts"));
assert(!!reExportModule, "re-export-test.ts module exists");
if (reExportModule) {
  const internalHelper = reExportModule.symbols.find((s) => s.name === "internalHelper");
  const anotherInternal = reExportModule.symbols.find((s) => s.name === "anotherInternal");
  assert(!!internalHelper, "internalHelper symbol exists in re-export-test.ts");
  assert(!!anotherInternal, "anotherInternal symbol exists in re-export-test.ts");
  if (internalHelper) assertEqual(internalHelper.isExport, true, "internalHelper is marked as export");
  if (anotherInternal) assertEqual(anotherInternal.isExport, true, "anotherInternal is marked as export");
}

// --- Test: re-export-consumer.ts ---
const consumerModule = data.modules.find((m) => m.id.endsWith("re-export-consumer.ts"));
assert(!!consumerModule, "re-export-consumer.ts module exists");
if (consumerModule) {
  const useHelper = consumerModule.symbols.find((s) => s.name === "useHelper");
  assert(!!useHelper, "useHelper symbol exists in re-export-consumer.ts");
  if (useHelper) assertEqual(useHelper.isExport, true, "useHelper is marked as export");
}
const consumerImport = data.imports.find((i) => i.source.endsWith("re-export-consumer.ts"));
assert(!!consumerImport, "re-export-consumer.ts has an import");
if (consumerImport) {
  assert(!!consumerImport.symbols, "import has symbol list");
  assertEqual(consumerImport.symbols?.length, 1, "import has exactly 1 symbol");
  assertEqual(consumerImport.symbols?.[0], "internalHelper", "imported symbol is internalHelper");
}

// --- Test: graph edges ---
const useHelperNode = graph.nodes.find((n: any) => n.id.endsWith(".useHelper"));
assert(!!useHelperNode, "useHelper node exists in graph");
const internalHelperNode = graph.nodes.find((n: any) => n.id.endsWith(".internalHelper"));
assert(!!internalHelperNode, "internalHelper node exists in graph");
const anotherInternalNode = graph.nodes.find((n: any) => n.id.endsWith(".anotherInternal"));
assert(!!anotherInternalNode, "anotherInternal node exists in graph");

if (useHelperNode && internalHelperNode) {
  const edgeToInternal = graph.edges.find(
    (e: any) => e.source === useHelperNode.id && e.target === internalHelperNode.id,
  );
  assert(!!edgeToInternal, "edge exists from useHelper to internalHelper");
}

if (useHelperNode && anotherInternalNode) {
  const edgeToAnother = graph.edges.find(
    (e: any) => e.source === useHelperNode.id && e.target === anotherInternalNode.id,
  );
  assert(!edgeToAnother, "no edge from useHelper to anotherInternal (import is specific)");
}

// --- Test: constants.ts has exports ---
const constantsModule = data.modules.find((m) => m.id.endsWith("constants.ts"));
assert(!!constantsModule, "constants.ts module exists");
if (constantsModule) {
  const apiUrl = constantsModule.symbols.find((s) => s.name === "API_URL");
  const maxRetries = constantsModule.symbols.find((s) => s.name === "MAX_RETRIES");
  const timeout = constantsModule.symbols.find((s) => s.name === "TIMEOUT");
  assert(!!apiUrl, "API_URL symbol exists");
  assert(!!maxRetries, "MAX_RETRIES symbol exists");
  assert(!!timeout, "TIMEOUT symbol exists");
  if (apiUrl) assertEqual(apiUrl.isExport, true, "API_URL is marked as export");
  if (maxRetries) assertEqual(maxRetries.isExport, true, "MAX_RETRIES is marked as export");
  if (timeout) assertEqual(timeout.isExport, true, "TIMEOUT is marked as export");
}

// --- Test: config.ts re-exports from constants.ts ---
const configModule = data.modules.find((m) => m.id.endsWith("config.ts"));
assert(!!configModule, "config.ts module exists");
// config.ts has export { API_URL, MAX_RETRIES } — re-exports, not declarations, so 0 symbols
assertEqual(configModule.symbols.length, 0, "config.ts has 0 symbols (it only re-exports)");
const configImport = data.imports.find((i) => i.source.endsWith("config.ts"));
assert(!!configImport, "config.ts has an import");
if (configImport) {
  assertEqual(configImport.symbols?.length, 2, "config.ts import has 2 symbols");
  assertIncludes(configImport.symbols || [], "API_URL", "config.ts imports API_URL");
  assertIncludes(configImport.symbols || [], "MAX_RETRIES", "config.ts imports MAX_RETRIES");
}

// The config.ts barrel must resolve to graph edges at the actual symbol locations
const mainNode = graph.nodes.find((n: any) => n.id === "main.ts.main");
const apiUrlNode = graph.nodes.find((n: any) => n.id.endsWith("constants.ts.API_URL"));
const maxRetriesNode = graph.nodes.find((n: any) => n.id.endsWith("constants.ts.MAX_RETRIES"));
if (mainNode && apiUrlNode) {
  assert(!!graph.edges.find((e: any) => e.source === mainNode.id && e.target === apiUrlNode.id), "edge main -> API_URL (via config.ts barrel)");
}
if (mainNode && maxRetriesNode) {
  assert(!!graph.edges.find((e: any) => e.source === mainNode.id && e.target === maxRetriesNode.id), "edge main -> MAX_RETRIES (via config.ts barrel)");
}

// --- Test: import-test/B.ts (specific named import) ---
const bModule = data.modules.find((m) => m.id.endsWith("B.ts"));
assert(!!bModule, "B.ts module exists");
const bImport = data.imports.find((i) => i.source.endsWith("B.ts"));
assert(!!bImport, "B.ts has an import");
if (bImport) {
  assertEqual(bImport.symbols?.length, 1, "B.ts imports exactly 1 symbol");
  assertEqual(bImport.symbols?.[0], "MY_CONSTANT", "B.ts imports MY_CONSTANT");
}
// B's useConstant should NOT be connected to other A.ts exports
const useConstNode = graph.nodes.find((n: any) => n.id.endsWith(".useConstant"));
const myConstNode = graph.nodes.find((n: any) => n.id.endsWith("A.MY_CONSTANT"));
if (useConstNode && myConstNode) {
  assert(!!graph.edges.find((e: any) => e.source === useConstNode.id && e.target === myConstNode.id), "edge useConstant -> MY_CONSTANT");
}

// --- Test: import-test/C.ts (wildcard/namespace import) ---
const cImport = data.imports.find((i) => i.source.endsWith("C.ts"));
assert(!!cImport, "C.ts has an import");
if (cImport) {
  assertEqual(cImport.type, "wildcard", "C.ts import is wildcard (namespace)");
  assert(!cImport.symbols, "C.ts import has no specific symbols (wildcard)");
}
const useModuleNode = graph.nodes.find((n: any) => n.id.endsWith(".useModule"));
if (useModuleNode && myConstNode) {
  assert(!!graph.edges.find((e: any) => e.source === useModuleNode.id && e.target === myConstNode.id), "edge useModule -> MY_CONSTANT (wildcard)");
}

// --- Test: auth/index.ts (wildcard import) ---
const authImport = data.imports.find((i) => i.source.endsWith("auth/index.ts"));
assert(!!authImport, "auth/index.ts has an import");
if (authImport) {
  assertEqual(authImport.type, "wildcard", "auth/index.ts import is wildcard");
}
const authNode = graph.nodes.find((n: any) => n.id.endsWith(".checkAuth"));
const authGetToken = graph.nodes.find((n: any) => n.id.endsWith("auth-get.token"));
if (authNode && authGetToken) {
  assert(!!graph.edges.find((e: any) => e.source === authNode.id && e.target === authGetToken.id), "edge checkAuth -> token (wildcard connects all exports)");
}

// --- Test: folder-a/unique.ts (import with .ts extension) ---
const folderAImport = data.imports.find((i) => i.source.endsWith("folder-a/unique.ts"));
assert(!!folderAImport, "folder-a/unique.ts has an import");
if (folderAImport) {
  assertEqual(folderAImport.symbols?.length, 1, "folder-a/unique.ts imports exactly 1 symbol");
  assertEqual(folderAImport.symbols?.[0], "uselessValue", "folder-a/unique.ts imports uselessValue");
  assert(folderAImport.target.endsWith("useless.ts"), "folder-a/unique.ts target resolves to useless.ts");
}

// --- Test: test-file.ts (import with .ts extension + namespace) ---
const testFileImport = data.imports.find((i) => i.source.endsWith("test-file.ts"));
assert(!!testFileImport, "test-file.ts has an import");
if (testFileImport) {
  assertEqual(testFileImport.type, "wildcard", "test-file.ts import is wildcard (namespace)");
}

// --- Test: main.ts (combined named + namespace imports) ---
const mainImports = data.imports.filter((i) => i.source.endsWith("main.ts"));
assert(mainImports.length >= 4, `main.ts has at least 4 imports (got ${mainImports.length})`);
// Check main.ts imports resolve to the right targets
if (mainImports.length > 0) {
  const utilsTargets = mainImports.filter((i) => i.target.endsWith("utils/utils.ts"));
  assert(utilsTargets.length >= 1, "main.ts imports from utils/utils.ts (at least 1)");
  const typesTargets = mainImports.filter((i) => i.target.endsWith("types/index.ts"));
  assert(typesTargets.length >= 1, "main.ts imports from types/index.ts (at least 1)");
}

// --- Test: intermediate.ts imports from base.ts ---
const intermediateImport = data.imports.find((i) => i.source.endsWith("intermediate.ts"));
assert(!!intermediateImport, "intermediate.ts has an import");
if (intermediateImport) {
  assertEqual(intermediateImport.symbols?.length, 1, "intermediate.ts imports exactly 1 symbol");
  assertEqual(intermediateImport.symbols?.[0], "BASE_VALUE", "intermediate.ts imports BASE_VALUE");
}

// --- Test: empty-file.ts (no symbols) ---
const emptyScript = data.scripts.find((s) => s.id.endsWith("empty-file.ts"));
assert(!!emptyScript, "empty-file.ts is a script (not a module)");
assertEqual(emptyScript.symbols.length, 0, "empty-file.ts has 0 symbols");

// --- Test: no-exports/no-exports.ts (no exports) ---
const noExportScript = data.scripts.find((s) => s.id.endsWith("no-exports.ts"));
assert(!!noExportScript, "no-exports.ts is a script (not a module)");
assertEqual(noExportScript.symbols.length, 2, "no-exports.ts has 2 symbols (internalValue, internalFunction)");
if (noExportScript) {
  const internalVal = noExportScript.symbols.find((s) => s.name === "internalValue");
  const internalFn = noExportScript.symbols.find((s) => s.name === "internalFunction");
  assert(!!internalVal, "internalValue symbol exists");
  assert(!!internalFn, "internalFunction symbol exists");
  if (internalVal) assertEqual(internalVal.isExport, false, "internalValue is not marked as export");
  if (internalFn) assertEqual(internalFn.isExport, false, "internalFunction is not marked as export");
}

// --- Test: internal.ts (type + export) ---
const internalModule = data.modules.find((m) => m.id.endsWith("internal.ts"));
assert(!!internalModule, "internal.ts is a module");
if (internalModule) {
  const defaultStatus = internalModule.symbols.find((s) => s.name === "DEFAULT_STATUS");
  assert(!!defaultStatus, "DEFAULT_STATUS symbol exists in internal.ts");
  if (defaultStatus) assertEqual(defaultStatus.type, "variable", "DEFAULT_STATUS is type variable");
}

// --- Test: types/ interfaces ---
const userType = data.modules.find((m) => m.id.endsWith("types/index.ts"));
assert(!!userType, "types/index.ts module exists");
if (userType) {
  const userIface = userType.symbols.find((s) => s.name === "User");
  assert(!!userIface, "User interface exists");
  if (userIface) assertEqual(userIface.isExport, true, "User is marked as export");
}
const userModelModule = data.modules.find((m) => m.id.endsWith("models/user.ts"));
assert(!!userModelModule, "models/user.ts module exists");
if (userModelModule) {
  const userModel = userModelModule.symbols.find((s) => s.name === "UserModel");
  assert(!!userModel, "UserModel interface exists");
  if (userModel) assertEqual(userModel.isExport, true, "UserModel is marked as export");
}

// --- Test: types/index.ts barrel re-exports resolve to actual symbols ---
const typesBarrelNode = graph.nodes.find((n: any) => n.id === "main.ts.main");
const userModelBarrelNode = graph.nodes.find((n: any) => n.id.endsWith("models/user.ts.UserModel"));
const userRoleBarrelNode = graph.nodes.find((n: any) => n.id.endsWith("models/user.ts.UserRole"));
const userDeclaredNode = graph.nodes.find((n: any) => n.id.endsWith("types/index.ts.User"));
const userIdDeclaredNode = graph.nodes.find((n: any) => n.id.endsWith("types/index.ts.UserId"));
const productModelDirectNode = graph.nodes.find((n: any) => n.id.endsWith("types/models/product.ts.ProductModel"));
if (typesBarrelNode && userModelBarrelNode) {
  assert(!!graph.edges.find((e: any) => e.source === typesBarrelNode.id && e.target === userModelBarrelNode.id), "edge main -> UserModel (via types/index.ts barrel)");
}
if (typesBarrelNode && userRoleBarrelNode) {
  assert(!!graph.edges.find((e: any) => e.source === typesBarrelNode.id && e.target === userRoleBarrelNode.id), "edge main -> UserRole (via types/index.ts barrel)");
}
if (typesBarrelNode && userDeclaredNode) {
  assert(!!graph.edges.find((e: any) => e.source === typesBarrelNode.id && e.target === userDeclaredNode.id), "edge main -> User (named import from './types')");
}

// Hybrid barrel: declared symbols have no via; re-exported symbols pass through the barrel
if (typesBarrelNode && userDeclaredNode) {
  assertEdgeVia(typesBarrelNode.id, userDeclaredNode.id, [], "main -> User is declared directly in types/index.ts (no via)");
}
if (typesBarrelNode && userIdDeclaredNode) {
  assertEdgeVia(typesBarrelNode.id, userIdDeclaredNode.id, [], "main -> UserId is declared directly in types/index.ts (no via)");
}
if (typesBarrelNode && userModelBarrelNode) {
  assertEdgeVia(typesBarrelNode.id, userModelBarrelNode.id, ["types/index.ts"], "main -> UserModel passes through types/index.ts");
}
if (typesBarrelNode && userRoleBarrelNode) {
  assertEdgeVia(typesBarrelNode.id, userRoleBarrelNode.id, ["types/index.ts"], "main -> UserRole passes through types/index.ts");
}
if (typesBarrelNode && productModelDirectNode) {
  assertEdgeVia(typesBarrelNode.id, productModelDirectNode.id, [], "main -> ProductModel is a direct import (no via)");
}

// --- Test: dynamic imports (string literal) ---
const hardcodedDynamicImport = data.imports.find((i) => i.source.endsWith("dynamic/dynamic-imports.ts") && i.type === "dynamic");
assert(!!hardcodedDynamicImport, "dynamic/dynamic-imports.ts has a dynamic import (string literal)");

const topLevelDynamicImport = data.imports.find((i) => i.source.endsWith("top-level-dynamic/top-level.ts") && i.type === "dynamic");
assert(!!topLevelDynamicImport, "top-level-dynamic/top-level.ts has a dynamic import (string literal at top level)");

// --- Test: unknown dynamic imports (variable-based, non-string-literal) ---
// These use import(variable) and should NOT have import edges.
// Instead they should have hasUnknownDynamicImport: true on the containing function.
const isolatedHardcoded = data.modules.find((m) => m.id.endsWith("dynamic-isolated/hardcoded.ts"));
assert(!!isolatedHardcoded, "dynamic-isolated/hardcoded.ts module exists");

const isolatedConstant = data.modules.find((m) => m.id.endsWith("dynamic-isolated/constant-import.ts"));
assert(!!isolatedConstant, "dynamic-isolated/constant-import.ts module exists");

const isolatedVariable = data.modules.find((m) => m.id.endsWith("dynamic-isolated/variable.ts"));
assert(!!isolatedVariable, "dynamic-isolated/variable.ts module exists");

// isolated-hardcoded uses import('../useless') a STRING LITERAL → should have an edge, NOT unknown
const hardcodedDynamic = data.imports.find((i) => i.source.endsWith("dynamic-isolated/hardcoded.ts") && i.type === "dynamic");
assert(!!hardcodedDynamic, "hardcoded.ts has a dynamic import edge (it uses a string literal)");
if (isolatedHardcoded) {
  const fn = isolatedHardcoded.symbols.find((s) => s.name === "testDynamicImportHardcoded");
  if (fn) assert(!fn.hasUnknownDynamicImport, "hardcoded.ts uses string literal, NOT unknown");
}

// isolated-constant uses import(HARDCODED_PATH) — a VARIABLE → should NOT have edge, should be unknown
const constantDynamicImport = data.imports.find(
  (i) => i.source.endsWith("dynamic-isolated/constant-import.ts") && i.type === "dynamic",
);
assert(!constantDynamicImport, "constant-import.ts has NO dynamic import edge (variable-based)");
if (isolatedConstant) {
  const fn = isolatedConstant.symbols.find((s) => s.name === "testDynamicImportConstant");
  assert(!!fn, "testDynamicImportConstant symbol exists");
  if (fn) assertEqual(fn.hasUnknownDynamicImport, true, "testDynamicImportConstant has unknown dynamic import");
}

// isolated-variable uses import(path) — a VARIABLE → should NOT have edge, should be unknown
const variableDynamicImport = data.imports.find(
  (i) => i.source.endsWith("dynamic-isolated/variable.ts") && i.type === "dynamic",
);
assert(!variableDynamicImport, "variable.ts has NO dynamic import edge (variable-based)");
if (isolatedVariable) {
  const fn = isolatedVariable.symbols.find((s) => s.name === "testDynamicImportVariable");
  assert(!!fn, "testDynamicImportVariable symbol exists");
  if (fn) assertEqual(fn.hasUnknownDynamicImport, true, "testDynamicImportVariable has unknown dynamic import");
}

// String-literal dynamic imports should NOT have unknownDynamicImport
const topLevelModule = data.modules.find((m) => m.id.endsWith("top-level-dynamic/top-level.ts"));
if (topLevelModule) {
  const helperResult = topLevelModule.symbols.find((s) => s.name === "helperResult");
  if (helperResult) assert(!helperResult.hasUnknownDynamicImport, "string-literal dynamic import does NOT have unknown flag");
}

// --- Test: .ts extension in imports ---
const folderAImportTs = data.imports.find((i) => i.source.endsWith("folder-a/unique.ts"));
assert(!!folderAImportTs, "folder-a/unique.ts import exists");
if (folderAImportTs) {
  assert(folderAImportTs.target.endsWith("useless.ts"), "folder-a/unique.ts target resolves correctly with .ts extension");
}

// --- Test: pure barrel (nohonu scenario) ---
// core/auth/users/index.ts re-exports only (`export ... from`), no imports/declarations.
// Consumers import it via namespace import. The re-exported symbols live in their own files.
const usersBarrel = data.modules.find((m) => m.id.endsWith("core/auth/users/index.ts"));
assert(!!usersBarrel, "core/auth/users/index.ts is a module (pure barrel)");

const usersImport = data.imports.filter((i) => i.source.endsWith("usecases/auth.ts") && i.target.endsWith("core/auth/users/index.ts"));
assert(usersImport.length >= 1, "usecases/auth.ts imports from core/auth/users/index.ts");

// The re-exported symbols must be reachable from the usecase symbols
const loginNode = graph.nodes.find((n: any) => n.id.endsWith("usecases/auth.ts.login"));
const registerNode = graph.nodes.find((n: any) => n.id.endsWith("usecases/auth.ts.register"));
const authResultNode = graph.nodes.find((n: any) => n.id.endsWith("usecases/auth.ts.AuthResult"));
const createUserNode = graph.nodes.find((n: any) => n.id.endsWith("create-user.ts.createUser"));
const validateUserNode = graph.nodes.find((n: any) => n.id.endsWith("validate-user.ts.validateUser"));
const getUserByUsernameNode = graph.nodes.find((n: any) => n.id.endsWith("get-user-by-username.ts.getUserByUsername"));
const userTypeNode = graph.nodes.find((n: any) => n.id.endsWith("user.ts.User"));

if (loginNode && validateUserNode) {
  assert(!!graph.edges.find((e: any) => e.source === loginNode.id && e.target === validateUserNode.id), "edge login -> validateUser (via barrel)");
}
if (loginNode && validateUserNode) {
  assertEdgeVia(loginNode.id, validateUserNode.id, ["core/auth/users/index.ts"], "login -> validateUser passes through core/auth/users/index.ts");
}
if (loginNode && getUserByUsernameNode) {
  assert(!!graph.edges.find((e: any) => e.source === loginNode.id && e.target === getUserByUsernameNode.id), "edge login -> getUserByUsername (via barrel)");
}
if (registerNode && createUserNode) {
  assert(!!graph.edges.find((e: any) => e.source === registerNode.id && e.target === createUserNode.id), "edge register -> createUser (via barrel)");
}
if (authResultNode && userTypeNode) {
  assert(!!graph.edges.find((e: any) => e.source === authResultNode.id && e.target === userTypeNode.id), "edge AuthResult -> User (via barrel)");
}

// --- Test: normal import without .ts extension ---
const noExtImport = data.imports.find((i) => i.source.endsWith("uses-constants.ts"));
assert(!!noExtImport, "uses-constants.ts has an import");
if (noExtImport) {
  assert(noExtImport.target.endsWith("constants.ts"), "import './constants' resolves to constants.ts");
  assertEqual(noExtImport.symbols?.length, 1, "uses-constants.ts imports exactly 1 symbol");
  assertEqual(noExtImport.symbols?.[0], "API_URL", "uses-constants.ts imports API_URL");
}
const getApiUrlNode = graph.nodes.find((n: any) => n.id.endsWith("uses-constants.ts.getApiUrl"));
const apiUrlConstNode = graph.nodes.find((n: any) => n.id.endsWith("constants.ts.API_URL"));
if (getApiUrlNode && apiUrlConstNode) {
  assert(!!graph.edges.find((e: any) => e.source === getApiUrlNode.id && e.target === apiUrlConstNode.id), "edge getApiUrl -> API_URL (import without .ts)");
}

// --- Test: barrel re-export without .ts extension ---
const noExtBarrel = data.modules.find((m) => m.id.endsWith("no-ext-barrel/index.ts"));
assert(!!noExtBarrel, "no-ext-barrel/index.ts is a module (barrel)");
assertEqual(noExtBarrel.symbols.length, 0, "no-ext-barrel/index.ts has 0 symbols (only re-exports)");

const noExtBarrelImport = data.imports.find((i) => i.source.endsWith("no-ext-barrel/uses-barrel.ts"));
assert(!!noExtBarrelImport, "uses-barrel.ts has an import");
if (noExtBarrelImport) {
  assert(noExtBarrelImport.target.endsWith("no-ext-barrel/index.ts"), "import './index' resolves to no-ext-barrel/index.ts");
}

// Re-export specifiers without .ts must resolve to the real symbol locations
const useBarrelNode = graph.nodes.find((n: any) => n.id.endsWith("no-ext-barrel/uses-barrel.ts.useBarrel"));
const valueANode = graph.nodes.find((n: any) => n.id.endsWith("no-ext-barrel/value-a.ts.VALUE_A"));
const valueBNode = graph.nodes.find((n: any) => n.id.endsWith("no-ext-barrel/value-b.ts.valueB"));
if (useBarrelNode && valueANode) {
  assert(!!graph.edges.find((e: any) => e.source === useBarrelNode.id && e.target === valueANode.id), "edge useBarrel -> VALUE_A (re-export without .ts)");
}
if (useBarrelNode && valueBNode) {
  assert(!!graph.edges.find((e: any) => e.source === useBarrelNode.id && e.target === valueBNode.id), "edge useBarrel -> valueB (re-export without .ts)");
}

// --- Test: type-only import (import type) ---
const typeOnlyImport = data.imports.find((i) => i.source.endsWith("type-only/uses-types.ts"));
assert(!!typeOnlyImport, "type-only/uses-types.ts has an import");
if (typeOnlyImport) {
  assertEqual(typeOnlyImport.type, "type", "type-only import is categorized as 'type'");
  assertEqual(typeOnlyImport.symbols?.length, 1, "type-only/uses-types.ts imports exactly 1 symbol");
  assertEqual(typeOnlyImport.symbols?.[0], "User", "type-only/uses-types.ts imports User");
}
const getUserNameNode = graph.nodes.find((n: any) => n.id.endsWith("type-only/uses-types.ts.getUserName"));
const userTypeOnlyNode = graph.nodes.find((n: any) => n.id.endsWith("types/index.ts.User"));
if (getUserNameNode && userTypeOnlyNode) {
  const edge = graph.edges.find((e: any) => e.source === getUserNameNode.id && e.target === userTypeOnlyNode.id);
  assert(!!edge, "edge getUserName -> User (type-only import)");
  if (edge) {
    assertEqual(edge.type, "type", "getUserName -> User edge has type 'type'");
    assertEqual(edge.label, "type-only import", "getUserName -> User edge label is 'type-only import'");
  }
}

// --- Test: import aliases (import { X as Y }) ---
const aliasImport = data.imports.find((i) => i.source.endsWith("alias/uses-alias.ts"));
assert(!!aliasImport, "alias/uses-alias.ts has an import");
if (aliasImport) {
  assert(aliasImport.target.endsWith("constants.ts"), "alias import resolves to constants.ts");
  assertEqual(aliasImport.symbols?.length, 2, "alias import has 2 symbols (original names)");
  assertIncludes(aliasImport.symbols || [], "API_URL", "alias import matches original name API_URL");
  assertIncludes(aliasImport.symbols || [], "MAX_RETRIES", "alias import matches original name MAX_RETRIES");
}
const getEndpointNode = graph.nodes.find((n: any) => n.id.endsWith("alias/uses-alias.ts.getEndpoint"));
const apiUrlAliasNode = graph.nodes.find((n: any) => n.id.endsWith("constants.ts.API_URL"));
const maxRetriesAliasNode = graph.nodes.find((n: any) => n.id.endsWith("constants.ts.MAX_RETRIES"));
if (getEndpointNode && apiUrlAliasNode) {
  assert(!!graph.edges.find((e: any) => e.source === getEndpointNode.id && e.target === apiUrlAliasNode.id), "edge getEndpoint -> API_URL (aliased import)");
}
if (getEndpointNode && maxRetriesAliasNode) {
  assert(!!graph.edges.find((e: any) => e.source === getEndpointNode.id && e.target === maxRetriesAliasNode.id), "edge getEndpoint -> MAX_RETRIES (aliased import)");
}

// --- Test: module-level import from an empty module (no symbols) ---
const emptyImporterModule = data.modules.find((m) => m.id.endsWith("empty-import/empty-importer.ts"));
assert(!!emptyImporterModule, "empty-import/empty-importer.ts is a module");
assertEqual(emptyImporterModule.symbols.length, 0, "empty-import/empty-importer.ts has 0 symbols");
const emptyImporterEdge = graph.edges.find((e: any) => e.source === "empty-import/empty-importer.ts" && e.moduleSource);
assert(!!emptyImporterEdge, "empty module emits a module-level edge");
if (emptyImporterEdge) {
  assert(emptyImporterEdge.target.endsWith("constants.ts.API_URL"), "module-level edge targets constants.ts.API_URL");
}

// --- Test: namespace import from an empty module (no symbols) ---
const emptyWildcardModule = data.modules.find((m) => m.id.endsWith("empty-import/empty-wildcard-importer.ts"));
assert(!!emptyWildcardModule, "empty-import/empty-wildcard-importer.ts is a module");
assertEqual(emptyWildcardModule.symbols.length, 0, "empty-import/empty-wildcard-importer.ts has 0 symbols");
const emptyWildcardEdges = graph.edges.filter((e: any) => e.source === "empty-import/empty-wildcard-importer.ts" && e.moduleSource);
assert(emptyWildcardEdges.length >= 3, "namespace import from empty module connects all exports");
assert(emptyWildcardEdges.every((e: any) => e.type === "wildcard"), "namespace module-level edges are wildcard");
assert(emptyWildcardEdges.some((e: any) => e.target.endsWith("constants.ts.API_URL")), "wildcard module-level edge reaches API_URL");
assert(emptyWildcardEdges.some((e: any) => e.target.endsWith("constants.ts.TIMEOUT")), "wildcard module-level edge reaches TIMEOUT");

// --- Test: re-export-only module shows its re-export dependency ---
// usecases/sites/load-analytics.ts in nohonu re-exports but shows no edges.
// A re-export (export ... from) is a real dependency that should appear as a
// module-level edge, even when the file has no symbols and no imports.
const reExportOnlyModule = data.modules.find((m) => m.id.endsWith("re-export-only/load-analytics.ts"));
assert(!!reExportOnlyModule, "re-export-only/load-analytics.ts is a module");
assertEqual(reExportOnlyModule.symbols.length, 0, "re-export-only/load-analytics.ts has 0 symbols");

const reExportOnlyEdge = graph.edges.find((e: any) => e.source === "re-export-only/load-analytics.ts");
assert(!!reExportOnlyEdge, "re-export-only module emits a module-level edge");
if (reExportOnlyEdge) {
  assert(reExportOnlyEdge.moduleSource, "re-export-only edge is module-level");
  assert(reExportOnlyEdge.target.endsWith("analytics/load-analytics.ts.loadAnalytics"), "re-export-only edge targets the re-exported symbol");
}

// --- Test: TypeScript frontend (.tsx with JSX) ---
const profileModule = data.modules.find((m) => m.id.endsWith("frontend/Profile.tsx"));
assert(!!profileModule, "frontend/Profile.tsx is a module");
if (profileModule) {
  const profileSymbol = profileModule.symbols.find((s) => s.name === "Profile");
  assert(!!profileSymbol, "Profile component symbol exists");
  if (profileSymbol) assertEqual(profileSymbol.type, "function", "Profile is type function");
}
const profileTypeImport = data.imports.find((i) => i.source.endsWith("frontend/Profile.tsx") && i.target.endsWith("types.ts"));
assert(!!profileTypeImport, "Profile.tsx has a type import to types");
if (profileTypeImport) {
  assertEqual(profileTypeImport.type, "type", "Profile.tsx type import is categorized as 'type'");
  assertIncludes(profileTypeImport.symbols || [], "User", "Profile.tsx imports User");
}
const profileNode = graph.nodes.find((n: any) => n.id.endsWith("frontend/Profile.tsx.Profile"));
const profileUserNode = graph.nodes.find((n: any) => n.id.endsWith("types/index.ts.User"));
if (profileNode && profileUserNode) {
  const edge = graph.edges.find((e: any) => e.source === profileNode.id && e.target === profileUserNode.id);
  assert(!!edge, "edge Profile -> User (from .tsx)");
  if (edge) assertEqual(edge.type, "type", "Profile -> User edge is type 'type'");
}

// --- Test: extensionless import resolving to a .tsx file ---
const tsxImport = data.imports.find((i) => i.source.endsWith("frontend/uses-app.ts"));
assert(!!tsxImport, "uses-app.ts has an import");
const renderNode = graph.nodes.find((n: any) => n.id.endsWith("frontend/uses-app.ts.render"));
const appNode = graph.nodes.find((n: any) => n.id.endsWith("frontend/app.tsx.App"));
if (renderNode && appNode) {
  assert(!!graph.edges.find((e: any) => e.source === renderNode.id && e.target === appNode.id), "edge render -> App (import resolves to .tsx)");
}

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
