import { createHmac, hkdfSync } from 'node:crypto';
import { z } from 'zod';
import { casefold } from '../casefold.ts';
import { policy } from '../config.ts';
import type { SettingSource } from '../config/settings.ts';
import { connectionSecret } from './platform-secrets.ts';

const credential = z.object({ login: z.string().min(1), password: z.string().min(1) });
const stripCharacters = new Set(Array.from(policy.dataforseo.strip_characters));
export function connectionPoolIdentity(
  connection: Parameters<typeof connectionSecret>[0],
  encryptionKey: string,
  env?: SettingSource,
) {
  return dataforseoSecretIdentity(connectionSecret(connection, encryptionKey, env), encryptionKey);
}
export function dataforseoSecretIdentity(packed: string, encryptionKey: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(packed);
  } catch {
    throw new Error('Stored DataForSEO credential is unreadable');
  }
  const result = credential.safeParse(payload);
  if (!result.success) throw new Error('Stored DataForSEO credential is unreadable');
  const characters = Array.from(result.data.login);
  let start = 0,
    end = characters.length;
  while (start < end && stripCharacters.has(characters[start]!)) start += 1;
  while (end > start && stripCharacters.has(characters[end - 1]!)) end -= 1;
  const login = casefold(characters.slice(start, end).join(''));
  const key = hkdfSync(
    'sha256',
    Buffer.from(encryptionKey, 'utf8'),
    Buffer.alloc(0),
    Buffer.from('citeladder:dataforseo:account-identity:v1'),
    32,
  );
  return createHmac('sha256', Buffer.from(key)).update(login, 'utf8').digest('hex');
}
