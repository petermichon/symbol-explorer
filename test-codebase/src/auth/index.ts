import * as authModule from '../get/auth-get';

export function checkAuth() {
  return authModule.auth;
}
