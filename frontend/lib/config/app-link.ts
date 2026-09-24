import { publicOrigins } from './public-origins';

/** Browser navigation to the product origin; local single-origin dev may stay relative. */
export function appHref(path: `/${string}`): string {
  const origin = publicOrigins(undefined, undefined, false).app;
  return origin ? new URL(path, origin).toString() : path;
}

/** Browser navigation from the product to a marketing page, such as a policy. */
export function websiteHref(path: `/${string}`): string {
  const origin = publicOrigins(undefined, undefined, false).website;
  return origin ? new URL(path, origin).toString() : path;
}
