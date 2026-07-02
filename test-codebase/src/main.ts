import { helper } from './utils/utils';
import * as utils from './utils/utils';
import { User } from './types';
import { UserId } from './types/index';
import { UserModel, UserRole } from './types';
import { ProductModel } from './types/models/product';
import { API_URL, MAX_RETRIES } from './config';
import { DEFAULT_STATUS } from './internal';
import { DERIVED_VALUE } from './intermediate';
import { uselessValue } from './useless';

export function main() {
  const result = helper();
  const another = utils.anotherHelper();
  const instance = new utils.HelperClass();
  const user: User = { id: 1, name: 'test' };
  const userId: UserId = 1;
  const userModel: UserModel = { id: 1, name: 'test', email: 'test@test.com' };
  const role: UserRole = 'admin';
  const product: ProductModel = { id: 1, name: 'widget', price: 10 };
  const apiUrl = API_URL;
  const maxRetries = MAX_RETRIES;
  const status = DEFAULT_STATUS;
  return result + another + instance.help();
}

export default main;
