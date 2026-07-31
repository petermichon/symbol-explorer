import { VALUE_A, valueB } from './index';

export function useBarrel(): string {
  return VALUE_A + valueB();
}
