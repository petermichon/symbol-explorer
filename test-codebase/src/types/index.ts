export interface User {
  id: number;
  name: string;
}

export type UserId = number;

// Re-export from nested models
export { UserModel, UserRole } from './models/user';
export { ProductModel, ProductCategory } from './models/product';
