import { publicApiOrigin } from './public-origins';

/**
 * The API host's origin for display in the app (crawl-log endpoints, the REST
 * API); locally the API container. Resolved at import from the app build's
 * environment, so only app modules import it: `public-origins.ts` itself is
 * shared with marketing islands, which have no `process.env` at runtime.
 */
// An origin carries no path, so a configured trailing slash never doubles into `//v1`.
export const API_HOST_ORIGIN = publicApiOrigin(undefined, false)?.origin ?? 'http://127.0.0.1:8100';
