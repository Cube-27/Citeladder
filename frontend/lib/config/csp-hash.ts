import { createHash } from 'node:crypto';

/** The CSP source that allows one inline script with exactly this text. Build-time (Node) only. */
export function cspScriptHash(text: string): `sha256-${string}` {
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;
}
