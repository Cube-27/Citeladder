import { publicOrigins } from './public-origins';

export function appHref(path: `/${string}`): string {
  const origin = publicOrigins(undefined, undefined, false).app;
  return origin ? new URL(path, origin).toString() : path;
}

export function websiteHref(path: `/${string}`): string {
  const origin = publicOrigins(undefined, undefined, false).website;
  return origin ? new URL(path, origin).toString() : path;
}

export function websiteUrl(path: `/${string}`): string {
  return new URL(websiteHref(path), globalThis.location.origin).href;
}
