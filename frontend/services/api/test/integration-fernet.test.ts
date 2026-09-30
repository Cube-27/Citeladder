import { describe, expect, it } from 'vitest';

import { createSecretCipher } from '../src/integrations/fernet.ts';

describe('integration credential encryption', () => {
  it('decrypts ciphertext produced by the Python Fernet implementation', () => {
    const cipher = createSecretCipher('citeladder integration interop test key');
    expect(
      cipher.decrypt(
        'gAAAAABqvIuCc6Cm_dGOY1keE_Af45ootZLg7LLg7IsSG3Oiw4ry0iCp3M6MiCtwMoJZxbvslVKf6iQ3OIz8GpHrf0A5A35L7AoTUE3hiRQbtnlSfXEjMy2CZ-Shj30m9AmHWKpOSr5U=',
      ),
    ).toBe('python integration refresh token');
  });

  it('rejects a modified token before decrypting it', () => {
    const cipher = createSecretCipher('citeladder integration interop test key');
    const token = cipher.encrypt('refresh token');
    const changed = `${token.slice(0, 12)}${token[12] === 'A' ? 'B' : 'A'}${token.slice(13)}`;
    expect(() => cipher.decrypt(changed)).toThrow('Invalid encrypted credential');
  });
});
