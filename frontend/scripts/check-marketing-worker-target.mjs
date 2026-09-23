import { readFile } from 'node:fs/promises';

const expected = {
  name: 'citeladder-marketing',
  domain: 'citeladder.com',
  upstream: 'https://origin.citeladder.com',
  app: 'https://app.citeladder.com',
};

const config = JSON.parse(
  await readFile(new URL('../apps/marketing/dist/server/wrangler.json', import.meta.url), 'utf8'),
);
const correctTarget =
  config.name === expected.name &&
  config.routes?.length === 1 &&
  config.routes[0].pattern === expected.domain &&
  config.routes[0].custom_domain === true &&
  config.vars?.PUBLIC_WEBSITE_HOST === expected.domain &&
  config.vars?.ORIGIN_UPSTREAM === expected.upstream &&
  config.vars?.PUBLIC_APP_ORIGIN === expected.app &&
  config.workers_dev === false &&
  config.preview_urls === false;
if (!correctTarget) {
  throw new Error(
    'Generated marketing Worker does not match production configuration; rebuild before deployment.',
  );
}
