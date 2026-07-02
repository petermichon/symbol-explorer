import { HARDCODED_PATH } from './constant';

export async function testDynamicImportConstant() {
  const uselessModule = await import(HARDCODED_PATH);
  return uselessModule.uselessValue;
}
