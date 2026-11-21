#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import { classifyPaths } from './ci-changes.mjs';
import { claimMachineSlot, claimWorktree } from './check-slots.mjs';
import {
  allowlistDiffFailures,
  apiModules,
  collectWriters,
  schemaTables,
  validateAllowlist,
  writerFailures,
} from './table-writers.mjs';
import { gitPaths as listGitPaths, workingDiffPaths as branchDiffPaths } from './working-diff.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = join(repositoryRoot, 'frontend');
const args = process.argv.slice(2).filter((argument) => argument !== '--');

function option(name, fallback) {
  const separateIndex = args.lastIndexOf(name);
  if (separateIndex >= 0) return args[separateIndex + 1] ?? fallback;
  const inline = args.findLast((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1) ?? fallback;
}

const mode = option('--mode', 'check');
if (!['fix', 'check'].includes(mode)) throw new Error(`Unknown quality mode: ${mode}`);

const requestedScopes = option('--scope', 'all')
  .split(',')
  .map((scope) => scope.trim().toLowerCase());
const validScopes = new Set(['all', 'changed', 'frontend', 'contract', 'api']);
for (const scope of requestedScopes) {
  if (!validScopes.has(scope)) throw new Error(`Unknown quality scope: ${scope}`);
}

function git(arguments_, options = {}) {
  return execFileSync('git', ['-C', repositoryRoot, ...arguments_], options); // NOSONAR: trusted PATH.
}

const gitPaths = (arguments_) => listGitPaths(repositoryRoot, arguments_);
const workingDiffPaths = () => branchDiffPaths(repositoryRoot);

function changedScopes() {
  const paths = workingDiffPaths();
  const owners = classifyPaths(paths);
  return new Set(['frontend', 'contract', 'api'].filter((owner) => owners[owner]));
}

function resolveScopes() {
  if (requestedScopes.includes('all')) return new Set(['frontend', 'contract', 'api']);
  if (requestedScopes.includes('changed')) return changedScopes();
  return new Set(requestedScopes);
}

const scopes = resolveScopes();
const gitDirectory = gitPaths(['rev-parse', '--absolute-git-dir'])[0];

if (requestedScopes.includes('changed')) {
  claimWorktree(gitDirectory);
  const scan = spawnSync(process.execPath, [join(repositoryRoot, 'scripts/secrets-scan.mjs')], {
    stdio: 'inherit',
  });
  if (scan.status !== 0) {
    process.stderr.write('\nSecrets scan failed; see the findings above.\n');
    process.exit(1);
  }
}

if (scopes.size === 0) {
  process.stdout.write('\nNo affected quality owners for the current working diff.\n');
  process.exit(0);
}

const builds = option('--builds', 'all');
if (!['all', 'affected'].includes(builds)) throw new Error(`Unknown builds mode: ${builds}`);

const SHARED_BUILD_INPUTS = [
  'frontend/package.json',
  'frontend/pnpm-lock.yaml',
  'frontend/pnpm-workspace.yaml',
  'frontend/vite.config.ts',
  'frontend/vp-shared-config.ts',
  'frontend/tsconfig.json',
  'frontend/postcss.config.mjs',
  'frontend/lib/config/',
];
const BUILD_INPUTS = {
  marketing: [
    'frontend/apps/marketing/',
    'frontend/components/marketing/',
    'frontend/lib/marketing-content/',
  ],
  docs: ['frontend/apps/docs/', 'frontend/scripts/prepare-docs-assets.mjs'],
  app: [
    'frontend/apps/app/vite.config.ts',
    'frontend/scripts/bundle-budget.json',
    'frontend/scripts/check-bundle-budget.mjs',
  ],
};

function selectedBuilds() {
  if (builds === 'all') return new Set(Object.keys(BUILD_INPUTS));
  const paths = workingDiffPaths();
  const touches = (prefixes) =>
    paths.some((path) => prefixes.some((prefix) => path === prefix || path.startsWith(prefix)));
  return new Set(
    Object.keys(BUILD_INPUTS).filter((name) =>
      touches([...SHARED_BUILD_INPUTS, ...BUILD_INPUTS[name]]),
    ),
  );
}

const passRecordPath = join(gitDirectory, 'quality-pass.json');

function treeFingerprint() {
  const hash = createHash('sha256');
  hash.update(git(['rev-parse', 'HEAD']));
  hash.update(git(['diff', 'HEAD', '--binary', '--no-ext-diff'], { maxBuffer: 512 * 1024 * 1024 }));
  for (const path of gitPaths(['ls-files', '--others', '--exclude-standard']).sort()) {
    hash.update(path);
    hash.update(readFileSync(join(repositoryRoot, path)));
  }
  return hash.digest('hex');
}

function previousPass() {
  try {
    return JSON.parse(readFileSync(passRecordPath, 'utf8'));
  } catch {
    return null;
  }
}

const previous = previousPass();
if (
  previous?.tree === treeFingerprint() &&
  [...scopes].every((scope) => previous.scopes.includes(scope)) &&
  (builds === 'affected' || previous.builds === 'all')
) {
  process.stdout.write(
    `\n${[...scopes].join(', ')} quality already passed for this exact tree; nothing to rerun.\n` +
      `Delete ${passRecordPath} to force a rerun.\n`,
  );
  process.exit(0);
}

await claimMachineSlot();

const logDirectory = join(gitDirectory, 'quality-logs');
mkdirSync(logDirectory, { recursive: true });
const failedSteps = [];

const logPathFor = (name) =>
  join(logDirectory, `${name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')}.log`);

function step(name, command, commandArgs, cwd, env = process.env) {
  process.stdout.write(`${name}…\n`);
  const logPath = logPathFor(name);
  const log = openSync(logPath, 'w');
  let result;
  try {
    result = spawnSync(command, commandArgs, {
      cwd,
      env,
      stdio: ['ignore', log, log],
    });
  } finally {
    closeSync(log);
  }
  if (!result.error && result.status === 0) return true;
  failedSteps.push(name);
  process.stderr.write(`${name} failed. ${result.error?.message ?? ''}\n`);
  process.stderr.write(`${readFileSync(logPath, 'utf8').split(/\r?\n/u).slice(-60).join('\n')}\n`);
  process.stderr.write(`Full output: ${logPath}\n`);
  return false;
}

function pnpm(name, commandArgs, env = process.env) {
  return step(name, 'pnpm', commandArgs, frontendRoot, env);
}

const QUALITY_BUILD_ENV = {
  ...process.env,
  PUBLIC_WEBSITE_ORIGIN: process.env.PUBLIC_WEBSITE_ORIGIN || 'https://citeladder.com',
  PUBLIC_APP_ORIGIN: process.env.PUBLIC_APP_ORIGIN || 'https://app.citeladder.com',
  PUBLIC_API_ORIGIN: process.env.PUBLIC_API_ORIGIN || 'https://api.citeladder.com',
};

function policyBase() {
  const base = process.env.COMPLEXITY_BASE_SHA;
  return base && !/^0+$/.test(base) ? base : null;
}

function policyDiffArgs() {
  const base = policyBase();
  return base ? ['--', '--check-policy-diff', base] : [];
}

function frontendChecks() {
  const artifacts = selectedBuilds();
  if (artifacts.has('marketing')) pnpm('Astro marketing build', ['build'], QUALITY_BUILD_ENV);
  if (artifacts.has('docs')) {
    pnpm('Astro documentation build', ['build:docs'], QUALITY_BUILD_ENV);
  }
  if (artifacts.has('app') && pnpm('Vite product-app build', ['build:vite'], QUALITY_BUILD_ENV)) {
    if (pnpm('Eager bundle budget', ['check:bundle'])) {
      process.stdout.write(readFileSync(logPathFor('Eager bundle budget'), 'utf8'));
    }
  }
  if (artifacts.size < Object.keys(BUILD_INPUTS).length) {
    process.stdout.write('Unaffected production builds skipped; CI builds every artifact.\n');
  }
  pnpm(mode === 'check' ? 'Vite+ static checks' : 'Vite+ static checks with fixes', [
    mode === 'check' ? 'check' : 'check:fix',
  ]);
  pnpm('TypeScript', ['exec', 'tsc', '--noEmit']);
  pnpm('Frontend complexity policy', ['check:complexity', ...policyDiffArgs()]);
  pnpm('Duplication policy', ['check:duplicates', ...policyDiffArgs()]);
  pnpm('Design-system and architecture policy', ['check:policy']);
  pnpm('Browser support matrix', ['check:compat']);
  pnpm('Frontend dead-code and dependency policy', ['check:dead-code']);
}

const SCHEMA_MIGRATIONS = 'api/migrations/<NNNN>_<name>.sql';
const SCHEMA_MIGRATION = /^\/api\/migrations\/\d{4}_[a-z0-9_]+\.sql$/u;
const SCHEMA_AUTHORING = [
  /\b(?:Migrator|FileMigrationProvider)\b/u,
  /\.schema\s*\.\s*(?:create|alter|drop)(?:Table|Index|Type|View|Schema)\b/u,
  /[`'"]\s*(?:create|alter|drop)\s+(?:unique\s+)?(?:table|index|type|view|schema|sequence)\b/iu,
];

function schemaAuthorityViolations(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.parentPath.includes('node_modules'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => {
      const relative = path.slice(root.length);
      if (SCHEMA_MIGRATION.test(relative)) return false;
      if (/\/migrations?\//u.test(relative) || relative.endsWith('.sql')) return true;
      if (relative.includes('/test/')) return false;
      if (!/\.[cm]?[jt]s$/u.test(path)) return false;
      const source = readFileSync(path, 'utf8');
      return SCHEMA_AUTHORING.some((pattern) => pattern.test(source));
    });
}

const API_ROOT = join(frontendRoot, 'services', 'api');
const TABLE_WRITERS = 'frontend/services/api/table-writers.json';

function baseTableWriters(base) {
  try {
    return validateAllowlist(
      JSON.parse(git(['show', `${base}:${TABLE_WRITERS}`], { encoding: 'utf8', stdio: 'pipe' })),
    );
  } catch (error) {
    if (/does not exist in|exists on disk, but not in/u.test(`${error.stderr ?? ''}`)) return null;
    throw error;
  }
}

function tableWriterViolations() {
  const allowlist = validateAllowlist(
    JSON.parse(readFileSync(join(repositoryRoot, TABLE_WRITERS), 'utf8')),
  );
  const tables = schemaTables(readFileSync(join(API_ROOT, 'src/generated/db-schema.ts'), 'utf8'));
  const violations = writerFailures(collectWriters(apiModules(API_ROOT), tables), allowlist);
  const base = policyBase();
  const baseAllowlist = base ? baseTableWriters(base) : null;
  if (baseAllowlist) violations.push(...allowlistDiffFailures(baseAllowlist, allowlist));
  return violations;
}

function apiServiceChecks() {
  pnpm('API service TypeScript', ['--filter', '@citeladder/api', 'typecheck']);
  pnpm('MCP tool reference', ['--filter', '@citeladder/api', 'mcp:reference', '--check']);
  pnpm('Public API reference', ['--filter', '@citeladder/api', 'public-api:reference', '--check']);
  pnpm('Crawl log Worker template', ['--filter', '@citeladder/api', 'crawl:worker', '--check']);
  pnpm('Firehose filter template', [
    '--filter',
    '@citeladder/api',
    'crawl:firehose-filter',
    '--check',
  ]);
  pnpm('Google Cloud sink filter docs', [
    '--filter',
    '@citeladder/api',
    'crawl:gcp-filter',
    '--check',
  ]);
  process.stdout.write('API service schema authority…\n');
  const violations = schemaAuthorityViolations(join(frontendRoot, 'services'));
  if (violations.length) {
    failedSteps.push('API service schema authority');
    process.stderr.write(
      `Schema changes belong in a new numbered migration (${SCHEMA_MIGRATIONS}), not elsewhere in a TS service:\n${violations.join('\n')}\n`,
    );
  }
  pnpm('API route ownership', ['--filter', '@citeladder/api', 'check:routes']);
  process.stdout.write('API table-writer allowlist…\n');
  const writerViolations = tableWriterViolations();
  if (writerViolations.length) {
    failedSteps.push('API table-writer allowlist');
    process.stderr.write(
      `A table has one writer module; ${TABLE_WRITERS} records them and may only tighten:\n${writerViolations.join('\n')}\n`,
    );
  }
  pnpm('API complexity policy', ['check:complexity:api', ...policyDiffArgs()]);
  pnpm('API duplication policy', ['check:duplicates:api', ...policyDiffArgs()]);
}

if (scopes.has('frontend')) frontendChecks();
if (scopes.has('contract') && !scopes.has('api')) pnpm('API contract policy', ['check:contract']);
if (scopes.has('api')) apiServiceChecks();

if (failedSteps.length) {
  process.stderr.write(`\nFailed: ${failedSteps.join(', ')}. Logs: ${logDirectory}\n`);
  process.exit(1);
}
writeFileSync(
  passRecordPath,
  JSON.stringify({ tree: treeFingerprint(), scopes: [...scopes], builds }),
);
process.stdout.write(`\n${[...scopes].join(', ')} quality ${mode} passed. Logs: ${logDirectory}\n`);
