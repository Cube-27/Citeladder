import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { createSecretCipher } from '../src/integrations/fernet.ts';
import { mcpPolicy } from '../src/mcp/config.ts';
import { parseRecordId, retrievalDocument } from '../src/mcp/retrieval.ts';

it('bounds complete UTF-8 documents and reassembles Unicode without losing structured evidence', () => {
  const id = randomUUID();
  const record = {
    text: '😀漢字'.repeat(mcpPolicy.max_document_bytes / 10),
    unknown: null,
    zero: 0,
  };
  const initial = retrievalDocument(
    'prompt',
    id,
    0,
    record,
    'Prompt',
    id,
    null,
    'https://app.example.test',
  );
  const metadata = initial.metadata as { part_uris: string[]; complete: boolean };
  expect(metadata.complete).toBe(false);
  const texts = metadata.part_uris.map((uri) => {
    const parsed = parseRecordId(uri);
    const part = retrievalDocument(
      parsed.kind,
      parsed.id,
      parsed.part,
      record,
      'Prompt',
      id,
      null,
      'https://app.example.test',
    );
    expect(Buffer.byteLength(JSON.stringify(part), 'utf8')).toBeLessThanOrEqual(
      mcpPolicy.max_document_bytes,
    );
    return part.text;
  });
  expect(JSON.parse(texts.join(''))).toEqual(record);
  expect(() =>
    retrievalDocument(
      'prompt',
      id,
      metadata.part_uris.length,
      record,
      'Prompt',
      id,
      null,
      'https://app.example.test',
    ),
  ).toThrow('not found');
});

it('rejects arbitrary sources and ambiguous continuation parameters', () => {
  const id = randomUUID();
  for (const uri of [
    'https://example.test/file',
    `citeladder://users/${id}`,
    `citeladder://prompt/${id}?part=-1`,
    `citeladder://prompt/${id}?part=0&part=1`,
    `citeladder://prompt/${id}?sql=select`,
    `citeladder://user@prompt/${id}`,
  ])
    expect(() => parseRecordId(uri)).toThrow();
});

it('reads Fernet custody in both runtimes and rejects tampering without a generated fixture', async () => {
  const backend = fileURLToPath(new URL('../../../../backend/', import.meta.url));
  const executable = fileURLToPath(
    new URL(
      process.platform === 'win32'
        ? '../../../../backend/.venv/Scripts/python.exe'
        : '../../../../backend/.venv/bin/python',
      import.meta.url,
    ),
  );
  const system = Object.fromEntries(
    ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME'].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : [],
    ),
  );
  const secret = 'interop-only-not-a-production-secret';
  const cipher = createSecretCipher(secret);
  const ciphertext = cipher.encrypt('credential');
  const code =
    'import base64,hashlib,sys; from cryptography.fernet import Fernet; f=Fernet(base64.urlsafe_b64encode(hashlib.sha256(sys.argv[1].encode()).digest())); print(f.decrypt(sys.argv[2].encode()).decode()); print(f.encrypt(b"python-credential").decode())';
  const { stdout } = await promisify(execFile)(executable, ['-c', code, secret, ciphertext], {
    cwd: backend,
    env: system,
  });
  const [clear, pythonCipher] = stdout.trim().split(/\r?\n/u);
  expect(clear).toBe('credential');
  expect(cipher.decrypt(pythonCipher!)).toBe('python-credential');
  const altered = Buffer.from(ciphertext, 'base64url');
  altered[30] = altered[30]! ^ 1;
  expect(() => cipher.decrypt(altered.toString('base64url'))).toThrow();
});
