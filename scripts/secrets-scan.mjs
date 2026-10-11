#!/usr/bin/env node
/**
 * Scans the branch's changed files with CI's gitleaks version and allowlist,
 * so a false positive is found before a push instead of after a CI cycle. The
 * version is read from ci.yml; the scan runs in Docker and is skipped with a
 * warning when Docker is unavailable (CI remains the gate).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { workingDiffPaths } from './working-diff.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = /GITLEAKS_VERSION:\s*([\d.]+)/u.exec(
  readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'),
)?.[1];
if (!version) throw new Error('GITLEAKS_VERSION is missing from ci.yml.');

if (spawnSync('docker', ['version'], { stdio: 'ignore' }).status !== 0) {
  process.stderr.write(
    'Docker is unavailable; skipping the local secrets scan (CI still runs it).\n',
  );
  process.exit(0);
}

const changed = workingDiffPaths(root).filter((path) => {
  const full = join(root, path);
  return existsSync(full) && statSync(full).isFile();
});
if (!changed.length) {
  process.stdout.write('Secrets scan: no changed files.\n');
  process.exit(0);
}

const scan = mkdtempSync(join(tmpdir(), 'citeladder-secrets-'));
let status;
try {
  for (const path of changed) cpSync(join(root, path), join(scan, path));
  status = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${scan}:/scan:ro`,
      '-v',
      `${join(root, '.gitleaks.toml')}:/config/.gitleaks.toml:ro`,
      `ghcr.io/gitleaks/gitleaks:v${version}`,
      'dir',
      '/scan',
      '--no-banner',
      '--redact',
      '--config',
      '/config/.gitleaks.toml',
    ],
    { stdio: 'inherit' },
  ).status;
} finally {
  rmSync(scan, { recursive: true, force: true });
}
if (status === 0) process.stdout.write(`Secrets scan: ${changed.length} changed files clean.\n`);
process.exit(status ?? 1);
