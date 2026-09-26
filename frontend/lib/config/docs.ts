/** Public documentation has no account or provider configuration. */
export const DOCS_ORIGIN = 'https://docs.citeladder.com';

export function docsHref(path = '/') {
  return new URL(path, DOCS_ORIGIN).href;
}
