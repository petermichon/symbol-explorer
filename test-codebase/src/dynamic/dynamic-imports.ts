// Test dynamic import with hardcoded string literal
export async function testDynamicImportHardcoded() {
  const uselessModule = await import('../useless');
  return uselessModule.uselessValue;
}

// Test dynamic import with hardcoded constant
const HARDCODED_PATH = '../useless';
export async function testDynamicImportConstant() {
  const uselessModule = await import(HARDCODED_PATH);
  return uselessModule.uselessValue;
}

// Test dynamic import with variable that crafts the path
export async function testDynamicImportVariable(feature: string) {
  const path = `../useless`;
  const uselessModule = await import(path);
  return uselessModule.uselessValue;
}
