/**
 * Reader-facing words for AI Traffic contract tokens.
 *
 * The screen speaks the reader's vocabulary, not the schema's: an enum such
 * as `not_connected` or `cdn_edge` reaches a reader only through here, and an
 * unmapped token falls back to spaced words rather than raw snake case.
 */
const CONNECTION = {
  not_connected: 'Not connected',
  awaiting_data: 'Awaiting data',
  connected: 'Connected',
} as const;

const COVERAGE = {
  complete: 'Complete coverage',
  declared_complete: 'Complete (client-reported)',
  partial: 'Partial coverage',
  unknown: 'Coverage unknown',
} as const;

const COLLECTION_POINT = {
  cdn_edge: 'CDN edge',
  origin: 'Origin server',
  application: 'Application',
  uploaded_file: 'Uploaded file',
} as const;

export const COLLECTION_POINTS = Object.keys(COLLECTION_POINT) as (keyof typeof COLLECTION_POINT)[];

export function words(token: string): string {
  const spaced = token.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function label<T extends Record<string, string>>(table: T, token: string): string {
  return token in table ? table[token as keyof T]! : words(token);
}

export const connectionLabel = (token: string) => label(CONNECTION, token);
export const coverageLabel = (token: string) => label(COVERAGE, token);
export const collectionPointLabel = (token: string) => label(COLLECTION_POINT, token);
