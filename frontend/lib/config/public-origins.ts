/** The two browser-visible origins. Production artifacts require both explicitly. */

function invalidOrigin(parsed: URL, production: boolean): boolean {
  return (
    !['http:', 'https:'].includes(parsed.protocol) ||
    (production && parsed.protocol !== 'https:') ||
    !!parsed.username ||
    !!parsed.password ||
    parsed.pathname !== '/' ||
    !!parsed.search ||
    !!parsed.hash
  );
}

function parsePublicOrigin(
  value: string | undefined,
  name: string,
  production: boolean,
): URL | null {
  if (!value) {
    if (production) throw new Error(`${name} is required in production.`);
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute origin.`);
  }
  if (invalidOrigin(parsed, production)) {
    throw new Error(
      `${name} must be a credential-free ${production ? 'HTTPS' : 'HTTP(S)'} origin.`,
    );
  }
  return parsed;
}

/**
 * The API host machine senders post to (`https://api.citeladder.com`): crawl
 * log endpoints shown in setup. Production app artifacts require it.
 */
export function publicApiOrigin(
  value = process.env.PUBLIC_API_ORIGIN,
  production = process.env.NODE_ENV === 'production' && process.env.LOCAL_COMPOSE_BUILD !== 'true',
): URL | null {
  return parsePublicOrigin(value, 'PUBLIC_API_ORIGIN', production);
}

export function publicOrigins(
  website = process.env.PUBLIC_WEBSITE_ORIGIN,
  app = process.env.PUBLIC_APP_ORIGIN,
  production = process.env.NODE_ENV === 'production' && process.env.LOCAL_COMPOSE_BUILD !== 'true',
): { website: URL | null; app: URL | null } {
  return {
    website: parsePublicOrigin(website, 'PUBLIC_WEBSITE_ORIGIN', production),
    app: parsePublicOrigin(app, 'PUBLIC_APP_ORIGIN', production),
  };
}

/** The API host's origin for display (crawl-log endpoints, the REST API); locally the API container. */
// An origin carries no path, so a configured trailing slash never doubles into `//v1`.
export const API_HOST_ORIGIN = publicApiOrigin(undefined, false)?.origin ?? 'http://127.0.0.1:8100';
