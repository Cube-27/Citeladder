/**
 * Worker-to-origin request signing. The Workers never send the origin key
 * itself: each upstream request carries an HMAC-SHA256 over the facts the API
 * trusts (time, method, public host, path with query, visitor address), so a
 * captured header cannot be reused for another route, host or client, and
 * expires with its timestamp.
 */
export const ORIGIN_TIMESTAMP_HEADER = 'X-CiteLadder-Origin-Timestamp';
export const ORIGIN_SIGNATURE_HEADER = 'X-CiteLadder-Origin-Signature';
export const ORIGIN_PUBLIC_HOST_HEADER = 'X-CiteLadder-Public-Host';
export const ORIGIN_CLIENT_IP_HEADER = 'X-CiteLadder-Client-IP';

export type OriginSignedFacts = Readonly<{
  /** Unix seconds when the Worker signed the request. */
  timestamp: number;
  method: string;
  publicHost: string;
  /** Path plus query exactly as sent upstream, e.g. `/api/v1/projects?limit=5`. */
  target: string;
  clientIp: string;
}>;

const encoder = new TextEncoder();

function payload(facts: OriginSignedFacts) {
  return [
    'citeladder-origin-v1',
    String(facts.timestamp),
    facts.method.toUpperCase(),
    facts.publicHost.toLowerCase(),
    facts.target,
    facts.clientIp,
  ].join('\n');
}

// One import per origin key (current and, during rotation, previous) per isolate.
const importedKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(key: string): Promise<CryptoKey> {
  let imported = importedKeys.get(key);
  if (!imported) {
    imported = crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    importedKeys.set(key, imported);
  }
  return imported;
}

/** Lowercase hex HMAC-SHA256 of the signed facts under one origin key. */
export async function signOriginRequest(key: string, facts: OriginSignedFacts): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(key),
    encoder.encode(payload(facts)),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}
