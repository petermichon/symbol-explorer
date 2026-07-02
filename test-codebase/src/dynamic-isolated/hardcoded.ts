// Test dynamic import with hardcoded string literal
export async function testDynamicImportHardcoded() {
  const uselessModule = await import('../useless');
  return uselessModule.uselessValue;
}
