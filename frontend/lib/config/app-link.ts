import { publicOrigins } from './public-origins';

/** Browser navigation to the product origin; local single-origin dev may stay relative. */
export function appHref(path: `/${string}`): string {
  const origin = publicOrigins(undefined, undefined, false).app;
  return origin ? new URL(path, origin).toString() : path;
}
