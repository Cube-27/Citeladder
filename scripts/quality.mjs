#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import { classifyPaths } from './ci-changes.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = join(repositoryRoot, 'frontend');
const args = process.argv.slice(2).filter((argument) => argument !== '--');

function option(name, fallback) {
  const separateIndex = args.indexOf(name);
  if (separateIndex >= 0) return args[separateIndex + 1] ?? fallback;
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
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

// Developer tooling runs `git` from the caller's PATH, like every other command
// this script launches; a pinned absolute path would not be portable.
function git(arguments_, options = {}) {
  return execFileSync('git', ['-C', repositoryRoot, ...arguments_], options); // NOSONAR: trusted PATH.
}

function gitPaths(arguments_) {
  return git(arguments_, { encoding: 'utf8' })
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((path) => path.replaceAll('\\', '/'));
}

function workingDiffPaths() {
  const mergeBase = gitPaths(['merge-base', 'origin/main', 'HEAD'])[0];
  const pathSets = [
    gitPaths(['diff', '--no-renames', '--name-only', '--diff-filter=ACMDT', `${mergeBase}..HEAD`]),
    gitPaths(['diff', '--no-renames', '--name-only', '--diff-filter=ACMDT']),
    gitPaths(['diff', '--cached', '--no-renames', '--name-only', '--diff-filter=ACMDT']),
    gitPaths(['ls-files', '--others', '--exclude-standard']),
  ];
  return [...new Set(pathSets.flat())];
}

function changedScopes() {
  const paths = workingDiffPaths();
  const owners = classifyPaths(paths);
  return new Set(['frontend', 'contract', 'api'].filter((owner) => owners[owner]));
}

const scopes = requestedScopes.includes('all')
  ? new Set(['frontend', 'contract', 'api'])
  : requestedScopes.includes('changed')
    ? changedScopes()
    : new Set(requestedScopes);

if (scopes.size === 0) {
  process.stdout.write('\nNo affected quality owners for the current working diff.\n');
  process.exit(0);
}

// `all` builds every production artifact (CI, release). `affected` builds only
// the artifacts whose sources or build configuration are in the working diff:
// tsc and `vp check` already cover ordinary TypeScript, and CI still builds.
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

// A passing run records the exact tree it judged. Rerunning the same checks on
// an unchanged tree cannot produce new evidence, so it is skipped.
const gitDirectory = gitPaths(['rev-parse', '--absolute-git-dir'])[0];
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

const logDirectory = join(gitDirectory, 'quality-logs');
mkdirSync(logDirectory, { recursive: true });
const failedSteps = [];

function step(name, command, commandArgs, cwd, env = process.env) {
  process.stdout.write(`${name}…\n`);
  const logPath = join(logDirectory, `${name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')}.log`);
  const log = openSync(logPath, 'w');
  let result;
  try {
    result = spawnSync(command, commandArgs, {
      cwd,
      env,
      windowsHide: true,
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
  if (process.platform === 'win32') {
    return step(
      name,
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'pnpm', ...commandArgs],
      frontendRoot,
      env,
    );
  }
  return step(name, 'pnpm', commandArgs, frontendRoot, env);
}

// Production-mode quality builds require both public origins. CI sets the
// accepted values on the frontend job; a local check falls back to the same
// ones so it builds the artifact CI builds, while an explicit value still wins.
const QUALITY_BUILD_ENV = {
  ...process.env,
  PUBLIC_WEBSITE_ORIGIN: process.env.PUBLIC_WEBSITE_ORIGIN || 'https://citeladder.com',
  PUBLIC_APP_ORIGIN: process.env.PUBLIC_APP_ORIGIN || 'https://app.citeladder.com',
  PUBLIC_API_ORIGIN: process.env.PUBLIC_API_ORIGIN || 'https://api.citeladder.com',
};

function policyDiffArgs() {
  const base = process.env.COMPLEXITY_BASE_SHA;
  return base && !/^0+$/.test(base) ? ['--', '--check-policy-diff', base] : [];
}

function frontendChecks() {
  const artifacts = selectedBuilds();
  if (artifacts.has('marketing')) pnpm('Astro marketing build', ['build'], QUALITY_BUILD_ENV);
  if (artifacts.has('docs')) {
    pnpm('Astro documentation build', ['build:docs'], QUALITY_BUILD_ENV);
  }
  // The budget reads the build's manifest, so it only runs against a fresh
  // build; after a failed one it would judge stale output.
  if (artifacts.has('app') && pnpm('Vite product-app build', ['build:vite'], QUALITY_BUILD_ENV)) {
    pnpm('Eager bundle budget', ['check:bundle']);
  }
  if (artifacts.size < Object.keys(BUILD_INPUTS).length) {
    process.stdout.write('Unaffected production builds skipped; CI builds every artifact.\n');
  }
  // Single static-check step: `vp check` (format + lint) reads its strict
  // policy — denyWarnings, unused-disable-directives-as-errors — from the
  // `lint.options` block shared by frontend/vite.config.ts and the root
  // vite.config.ts, so editor, hook, and CI cannot drift apart.
  pnpm(mode === 'check' ? 'Vite+ static checks' : 'Vite+ static checks with fixes', [
    mode === 'check' ? 'check' : 'check:fix',
  ]);
  // TypeScript compiler diagnostics stay on tsc: vite-plus 0.3.1 couples
  // lint.options.typeCheck to typeAware, whose rule surface still reports 47
  // pre-existing findings here and whose tsgolint rejects the marketing
  // tsconfig's baseUrl. See the comment in frontend/vp-shared-config.ts.
  pnpm('TypeScript', ['exec', 'tsc', '--noEmit']);
  // docs/design.md's value tables are generated from CSS; fix mode refreshes
  // them so the policy check below judges current documentation.
  if (mode === 'fix') {
    step(
      'Design token documentation',
      process.execPath,
      ['scripts/audit-design-tokens.mjs', '--write'],
      frontendRoot,
    );
  }
  pnpm('Frontend complexity policy', ['check:complexity', ...policyDiffArgs()]);
  pnpm('Duplication policy', ['check:duplicates', ...policyDiffArgs()]);
  pnpm('Design-system and architecture policy', ['check:policy']);
  pnpm('Frontend dead-code and dependency policy', ['check:dead-code']);
}

// The SQL baseline is the only schema author (docs/invariants.md 17): every
// other service file holds generated types and queries, never migration files
// or DDL. The migrate CLI applies the baseline; it does not author schema.
const SCHEMA_BASELINE = '/api/migrations/0001_baseline.sql';
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
      const relative = path.slice(root.length).replaceAll(sep, '/');
      if (relative === SCHEMA_BASELINE) return false;
      if (/\/migrations?\//u.test(relative) || relative.endsWith('.sql')) return true;
      // Tests build disposable databases and constraint fixtures; only shipped source is policed.
      if (relative.includes('/test/')) return false;
      if (!/\.[cm]?[jt]s$/u.test(path)) return false;
      const source = readFileSync(path, 'utf8');
      return SCHEMA_AUTHORING.some((pattern) => pattern.test(source));
    });
}

function apiServiceChecks() {
  pnpm('API service TypeScript', ['--filter', '@citeladder/api', 'typecheck']);
  pnpm('MCP tool reference', ['--filter', '@citeladder/api', 'mcp:reference', '--check']);
  pnpm('Crawl log Worker template', ['--filter', '@citeladder/api', 'crawl:worker', '--check']);
  pnpm('Firehose filter template', [
    '--filter',
    '@citeladder/api',
    'crawl:firehose-filter',
    '--check',
  ]);
  process.stdout.write('API service schema authority…\n');
  const violations = schemaAuthorityViolations(join(frontendRoot, 'services'));
  if (violations.length) {
    failedSteps.push('API service schema authority');
    process.stderr.write(
      `Schema changes belong in ${SCHEMA_BASELINE.slice(1)}, not elsewhere in a TS service:\n${violations.join('\n')}\n`,
    );
  }
  pnpm('API route ownership', ['--filter', '@citeladder/api', 'check:routes']);
}

if (scopes.has('frontend')) frontendChecks();
if (scopes.has('contract') && !scopes.has('api')) pnpm('API contract policy', ['check:contract']);
if (scopes.has('api')) apiServiceChecks();

if (failedSteps.length) {
  process.stderr.write(`\nFailed: ${failedSteps.join(', ')}. Logs: ${logDirectory}\n`);
  process.exit(1);
}
// Fingerprint after the run: fix mode may have rewritten files.
writeFileSync(
  passRecordPath,
  JSON.stringify({ tree: treeFingerprint(), scopes: [...scopes], builds }),
);
process.stdout.write(`\n${[...scopes].join(', ')} quality ${mode} passed. Logs: ${logDirectory}\n`);
