import type { User } from '../types';

export function getUserName(user: User): string {
  return user.name;
}
