export const ORIGIN_TIMESTAMP_HEADER = 'X-CiteLadder-Origin-Timestamp';
export const ORIGIN_SIGNATURE_HEADER = 'X-CiteLadder-Origin-Signature';
export const ORIGIN_PUBLIC_HOST_HEADER = 'X-CiteLadder-Public-Host';
export const ORIGIN_CLIENT_IP_HEADER = 'X-CiteLadder-Client-IP';

export type OriginSignedFacts = Readonly<{
  timestamp: number;
  method: string;
  publicHost: string;
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
