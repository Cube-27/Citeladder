import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./check-marketing-worker-output.mjs', import.meta.url));

test('marks research datasets and the manifest noindex, leaving pages indexable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'citeladder-marketing-output-'));
  try {
    await mkdir(join(directory, 'client', 'research', 'study'), { recursive: true });
    await mkdir(join(directory, 'server'));
    await writeFile(join(directory, 'server', 'entry.mjs'), 'export default {};');
    await writeFile(join(directory, 'client', '_headers'), '');
    await writeFile(join(directory, 'client', 'research', 'study', 'data.json'), '{}');
    await writeFile(join(directory, 'client', 'manifest.webmanifest'), '{}');
    await writeFile(join(directory, 'client', 'pricing.html'), '<p>Pricing</p>');
    const result = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const headers = await readFile(join(directory, 'client', '_headers'), 'utf8');
    assert.match(headers, /^\/research\/study\/data\.json\n {2}X-Robots-Tag: noindex$/mu);
    assert.match(headers, /^\/manifest\.webmanifest\n {2}X-Robots-Tag: noindex$/mu);
    assert.equal(headers.match(/X-Robots-Tag/gu)?.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects mail-provider client code without mistaking lookalike hosts for that provider', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'citeladder-marketing-output-'));
  try {
    await mkdir(join(directory, 'client'));
    await mkdir(join(directory, 'server'));
    await writeFile(join(directory, 'server', 'entry.mjs'), 'export default {};');
    for (const [content, rejected] of [
      ['const endpoint = "https://api.resend.com/emails";', true],
      ['const endpoint = "https://api.resend.com:443/emails";', true],
      ['const key = "RESEND_API_KEY";', true],
      ['const endpoint = "https://api.resend.com.example/emails";', false],
      ['const endpoint = "https://example.com/api.resend.com";', false],
    ]) {
      await writeFile(join(directory, 'client', '_headers'), '');
      await writeFile(join(directory, 'client', 'app.js'), content);
      const result = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
      assert.equal(result.status === 0, !rejected, result.stderr || result.stdout);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
