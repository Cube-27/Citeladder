import { publicApiOrigin } from './public-origins';

export const API_HOST_ORIGIN = publicApiOrigin(undefined, false)?.origin ?? 'http://127.0.0.1:8100';
