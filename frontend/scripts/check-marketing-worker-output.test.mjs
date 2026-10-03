import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./check-marketing-worker-output.mjs', import.meta.url));

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
