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
    } else if (extname(full) === ".ts") {
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

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
