import { API_URL as API_ENDPOINT, MAX_RETRIES as RETRIES } from '../constants';

export function getEndpoint(): string {
  return `${API_ENDPOINT}/${RETRIES}`;
}
