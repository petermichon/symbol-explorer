export interface UserModel {
  id: number;
  name: string;
  email: string;
}

export type UserRole = 'admin' | 'user' | 'guest';
