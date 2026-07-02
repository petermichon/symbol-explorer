import * as healthModule from '../get/health-get';

export function checkHealth() {
  return healthModule.health;
}
