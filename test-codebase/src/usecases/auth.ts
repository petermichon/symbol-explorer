import * as users from '../core/auth/users/index.ts';
import type { User } from '../core/auth/users/index.ts';

export interface AuthResult {
  success: boolean;
  user?: User;
}

export function login(username: string, password: string): AuthResult {
  const valid = users.validateUser(username, password);
  if (!valid) return { success: false };
  const user = users.getUserByUsername(username);
  return { success: true, user: user ? { username: user, displayName: user } : undefined };
}

export function register(username: string): string {
  return users.createUser(username);
}
