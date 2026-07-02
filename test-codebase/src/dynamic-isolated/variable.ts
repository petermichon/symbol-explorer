export async function testDynamicImportVariable(feature: string) {
  const path = `../useless`;
  const uselessModule = await import(path);
  return uselessModule.uselessValue;
}
