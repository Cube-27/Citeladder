import { findAppRoute, isAgentPath } from './app-routes';

/**
 * The steps above a record page: its collection, named by that route's title.
 * None for a top-level page, nor for a chat: the Agent's sidebar lists it.
 */
export function routeTrail(pathname: string): readonly { label: string; href: string }[] {
  if (isAgentPath(pathname)) return [];
  const collection = findAppRoute(pathname)?.collection;
  const parent = collection ? findAppRoute(collection) : undefined;
  return collection && parent?.title ? [{ label: parent.title, href: collection }] : [];
}
