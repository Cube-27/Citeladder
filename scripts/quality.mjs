#!/usr/bin/env node

import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import { classifyPaths } from './ci-changes.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = join(repositoryRoot, 'backend');
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
const validScopes = new Set(['all', 'changed', 'backend', 'frontend', 'contract']);
for (const scope of requestedScopes) {
  if (!validScopes.has(scope)) throw new Error(`Unknown quality scope: ${scope}`);
}

function gitPaths(arguments_) {
  const output = execFileSync('git', ['-C', repositoryRoot, ...arguments_], {
    encoding: 'utf8',
  });
  return output
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
  return new Set(['backend', 'frontend', 'contract'].filter((owner) => owners[owner]));
}

const scopes = requestedScopes.includes('all')
  ? new Set(['backend', 'frontend', 'contract'])
  : requestedScopes.includes('changed')
    ? changedScopes()
    : new Set(requestedScopes);

if (scopes.size === 0) {
  process.stdout.write('\nNo affected quality owners for the current working diff.\n');
  process.exit(0);
}

function executable(candidates, missingMessage) {
  const path = candidates.find(existsSync);
  if (!path) throw new Error(missingMessage);
  return path;
}

const backendPython = () =>
  executable(
    [
      join(backendRoot, '.venv', 'Scripts', 'python.exe'),
      join(backendRoot, '.venv', 'bin', 'python'),
    ],
    "Backend virtual environment missing. Run 'uv sync --frozen --extra dev' in backend/.",
  );

function backendTool(name) {
  return executable(
    [join(backendRoot, '.venv', 'Scripts', `${name}.exe`), join(backendRoot, '.venv', 'bin', name)],
    `Backend tool '${name}' missing. Run 'uv sync --frozen --extra dev' in backend/.`,
  );
}

const logDirectory = join(gitPaths(['rev-parse', '--absolute-git-dir'])[0], 'quality-logs');
mkdirSync(logDirectory, { recursive: true });
const failedSteps = [];

function step(name, command, commandArgs, cwd, env = process.env) {
  process.stdout.write(`${name}…\n`);
  const logPath = join(logDirectory, `${name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')}.log`);
  const log = openSync(logPath, 'w');
  let result;
  try {
    result = spawnSync(command, commandArgs, { cwd, env, stdio: ['ignore', log, log] });
  } finally {
    closeSync(log);
  }
  if (!result.error && result.status === 0) return;
  failedSteps.push(name);
  process.stderr.write(`${name} failed. ${result.error?.message ?? ''}\n`);
  process.stderr.write(`${readFileSync(logPath, 'utf8').split(/\r?\n/u).slice(-60).join('\n')}\n`);
  process.stderr.write(`Full output: ${logPath}\n`);
}

function pnpm(name, commandArgs, env = process.env) {
  if (process.platform === 'win32') {
    step(
      name,
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'pnpm', ...commandArgs],
      frontendRoot,
      env,
    );
    return;
  }
  step(name, 'pnpm', commandArgs, frontendRoot, env);
}

// Production-mode quality builds require both public origins. CI sets the
// accepted values on the frontend job; a local check falls back to the same
// ones so it builds the artifact CI builds, while an explicit value still wins.
const QUALITY_BUILD_ENV = {
  ...process.env,
  PUBLIC_WEBSITE_ORIGIN: process.env.PUBLIC_WEBSITE_ORIGIN || 'https://citeladder.com',
  PUBLIC_APP_ORIGIN: process.env.PUBLIC_APP_ORIGIN || 'https://app.citeladder.com',
};

function policyDiffArgs() {
  const base = process.env.COMPLEXITY_BASE_SHA;
  return base && !/^0+$/.test(base) ? ['--', '--check-policy-diff', base] : [];
}

function backendChecks() {
  const rootScripts = ['--config', 'pyproject.toml', '../reset-db.py'];
  if (mode === 'check') {
    step('Ruff lint', backendTool('ruff'), ['check', '.', ...rootScripts], backendRoot);
    step(
      'Ruff format',
      backendTool('ruff'),
      ['format', '--check', '.', ...rootScripts],
      backendRoot,
    );
  } else {
    step(
      'Ruff lint fixes',
      backendTool('ruff'),
      ['check', '.', '--fix', ...rootScripts],
      backendRoot,
    );
    step('Ruff format fixes', backendTool('ruff'), ['format', '.', ...rootScripts], backendRoot);
  }
  step('Mypy', backendTool('mypy'), [], backendRoot);
  step(
    'Complexity policy',
    backendPython(),
    ['-m', 'scripts.check_complexity', ...policyDiffArgs().slice(1)],
    backendRoot,
  );
  step('Test shape policy', backendPython(), ['-m', 'scripts.check_test_shape'], backendRoot);
  step('Architecture policy', backendTool('lint-imports'), [], backendRoot);
  step(
    'Dead-code policy',
    backendTool('vulture'),
    ['app', 'evaluations', 'scripts', '--min-confidence', '80'],
    backendRoot,
  );
  step('Dependency hygiene', backendTool('deptry'), ['.'], backendRoot);
}

function frontendChecks() {
  pnpm('Astro marketing build', ['build'], QUALITY_BUILD_ENV);
  pnpm('Vite product-app build', ['build:vite'], QUALITY_BUILD_ENV);
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
  pnpm('Frontend complexity policy', ['check:complexity', ...policyDiffArgs()]);
  pnpm('Duplication policy', ['check:duplicates', ...policyDiffArgs()]);
  pnpm('Design-system and architecture policy', ['check:policy']);
  pnpm('Frontend dead-code and dependency policy', ['check:dead-code']);
}

if (scopes.has('backend')) backendChecks();
if (scopes.has('frontend')) frontendChecks();
if (scopes.has('contract')) pnpm('API contract policy', ['check:contract']);

if (failedSteps.length) {
  process.stderr.write(`\nFailed: ${failedSteps.join(', ')}. Logs: ${logDirectory}\n`);
  process.exit(1);
}
process.stdout.write(`\n${[...scopes].join(', ')} quality ${mode} passed. Logs: ${logDirectory}\n`);
