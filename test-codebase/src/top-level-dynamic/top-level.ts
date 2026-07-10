// Test dynamic import at top level (not inside a function)
const uselessModule = await import('../useless.ts');

export const helperResult = uselessModule.uselessValue;
