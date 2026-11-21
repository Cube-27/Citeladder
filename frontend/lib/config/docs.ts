export const DOCS_ORIGIN = process.env.PUBLIC_DOCS_ORIGIN || 'https://docs.citeladder.com';

export function docsHref(path = '/') {
  return new URL(path, DOCS_ORIGIN).href;
}
