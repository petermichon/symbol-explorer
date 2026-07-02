export function helper() {
  return 'helper';
}

export function anotherHelper() {
  return 'another';
}

export class HelperClass {
  constructor() {}
  help() {
    return 'class help';
  }
}

export const helperVar = 'variable';

export interface HelperInterface {
  name: string;
}

export type HelperType = string | number;

export enum HelperEnum {
  A,
  B,
  C,
}
