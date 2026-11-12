#!/usr/bin/env node

import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TRUE = 'true';
const FALSE = 'false';
const GIT_EXECUTABLE =
  process.platform === 'win32' ? String.raw`C:\Program Files\Git\cmd\git.exe` : '/usr/bin/git';
const E2E_RULES = JSON.parse(readFileSync(new URL('./e2e-paths.json', import.meta.url), 'utf8'));
const DOC_FILES = new Set([
  'CLAUDE.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'PRODUCT.md',
  'README.md',
  'Review.md',
]);

// Configuration read only by external services or by deploy-only workflows.
// No owner suite exercises these files, so they never escalate to every owner.
const INERT_CONFIG_FILES = new Set([
  '.sonarcloud.properties',
  '.github/dependabot.yml',
  '.github/actions/require-green-main/action.yml',
  '.github/workflows/gcp-deploy.yml',
  '.github/workflows/workers-api-host-deploy.yml',
  '.github/workflows/workers-app-deploy.yml',
  '.github/workflows/workers-docs-deploy.yml',
  '.github/workflows/workers-marketing-deploy.yml',
]);

function isDocumentation(path) {
  return path.startsWith('docs/') || DOC_FILES.has(path);
}

function isOwnerFree(path) {
  return isDocumentation(path) || INERT_CONFIG_FILES.has(path);
}

function isFrontend(path) {
  return path.startsWith('frontend/');
}

// Frontend files outside the API package that its code, scripts or tests read:
// the PDF brand tokens, the docs artifacts its reference exporters check and
// its tests import, and the formatter settings the exporters write with.
// scripts/ci-changes.test.mjs derives these reads from the API sources.
const API_EXTERNAL_INPUTS = [
  'frontend/apps/app/src/globals.css',
  'frontend/apps/docs/public/templates/',
  'frontend/apps/docs/src/content/ai-traffic.md',
  'frontend/apps/docs/src/data/mcp-tools.json',
  'frontend/apps/docs/src/data/public-api.json',
  'frontend/vp-shared-config.ts',
];

// The TypeScript API service (including its SQL schema baseline), the
// contracts package it imports, and the frontend files it reads.
function isApiService(path) {
  return (
    path.startsWith('frontend/services/') ||
    path.startsWith('frontend/packages/') ||
    path === 'frontend/package.json' ||
    path === 'frontend/pnpm-lock.yaml' ||
    path === 'frontend/pnpm-workspace.yaml' ||
    API_EXTERNAL_INPUTS.some((input) =>
      input.endsWith('/') ? path.startsWith(input) : path === input,
    )
  );
}

function globRegex(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length;) {
    if (pattern[index] === '*') {
      if (pattern[index + 1] === '*') {
        if (pattern[index + 2] === '/') {
          source += '(?:.*/)?';
          index += 3;
        } else {
          source += '.*';
          index += 2;
        }
      } else {
        source += '[^/]*';
        index += 1;
      }
    } else if (pattern[index] === '?') {
      source += '[^/]';
      index += 1;
    } else {
      source += pattern[index].replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
      index += 1;
    }
  }
  return new RegExp(`${source}$`, 'u');
}

export function matchesAny(path, patterns) {
  return patterns.some((pattern) => globRegex(pattern).test(path));
}

// Specs frontend/playwright.config.ts ignores because another config owns
// them: docs.spec.ts runs in the docs job (`pnpm test:docs`) and
// worker-csp.spec.ts under playwright.workers.config.ts. Passing one to the
// app E2E job makes Playwright fail with "No tests found".
const OTHER_CONFIG_SPECS = new Set(['e2e/docs.spec.ts', 'e2e/worker-csp.spec.ts']);

const REPOSITORY_ROOT = new URL('../', import.meta.url);
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/gu;
const RESOLVED_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

function readRepositoryFile(path) {
  try {
    return readFileSync(new URL(path, REPOSITORY_ROOT), 'utf8');
  } catch {
    return null;
  }
}

/** The repository file a spec's import names, or null for a package import. */
function resolveImport(fromPath, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = `frontend/${specifier.slice(2)}`;
  else if (specifier.startsWith('.')) {
    const parts = fromPath.split('/').slice(0, -1);
    for (const part of specifier.split('/')) {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
    }
    base = parts.join('/');
  } else return null;
  for (const extension of RESOLVED_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (readRepositoryFile(candidate) !== null) return candidate;
  }
  return null;
}

let e2eImportGraph;

/**
 * Every repository file each app E2E spec reads at run time, transitively:
 * helpers, fixtures and the shared content they assert against. A change to
 * one of them selects every spec that imports it.
 */
function specsByImportedFile() {
  if (e2eImportGraph) return e2eImportGraph;
  e2eImportGraph = new Map();
  let specs = [];
  try {
    specs = readdirSync(new URL('frontend/e2e/', REPOSITORY_ROOT)).filter((name) =>
      name.endsWith('.spec.ts'),
    );
  } catch {
    return e2eImportGraph;
  }
  for (const name of specs) {
    const spec = `e2e/${name}`;
    if (OTHER_CONFIG_SPECS.has(spec)) continue;
    const pending = [`frontend/${spec}`];
    const visited = new Set(pending);
    while (pending.length) {
      const file = pending.pop();
      const source = readRepositoryFile(file) ?? '';
      for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
        const imported = resolveImport(file, specifier);
        if (!imported || visited.has(imported)) continue;
        visited.add(imported);
        pending.push(imported);
        const selecting = e2eImportGraph.get(imported) ?? new Set();
        selecting.add(spec);
        e2eImportGraph.set(imported, selecting);
      }
    }
  }
  return e2eImportGraph;
}

export function selectE2EFiles(paths) {
  const selected = new Set();
  const addTest = (test) => {
    if (!/^e2e\/[A-Za-z0-9][A-Za-z0-9_./-]*\.spec\.ts$/u.test(test)) {
      throw new Error(`Invalid E2E mapping: ${test}`);
    }
    selected.add(test);
  };
  for (const path of paths) {
    const spec = path.slice('frontend/'.length);
    if (/^frontend\/e2e\/.+\.spec\.ts$/u.test(path) && !OTHER_CONFIG_SPECS.has(spec)) {
      addTest(spec);
    }
    for (const test of specsByImportedFile().get(path) ?? []) addTest(test);
    for (const rule of E2E_RULES) {
      if (Array.isArray(rule.frontendE2E) && matchesAny(path, rule.sources)) {
        for (const test of rule.frontendE2E) addTest(test);
      }
    }
  }
  // Test paths, so plain code-point order is the intended ordering; the
  // comparator only says so out loud.
  return [...selected].sort((left, right) => (left < right ? -1 : Number(left > right)));
}

/** True when a changed path maps to `"frontendE2E": "all"` in e2e-paths.json. */
function selectsEveryE2E(paths) {
  return paths.some((path) =>
    E2E_RULES.some((rule) => rule.frontendE2E === 'all' && matchesAny(path, rule.sources)),
  );
}

/** The specs the E2E job passes to Playwright; an empty list runs every spec. */
export function e2eSpecArgs(paths) {
  return selectsEveryE2E(paths) ? [] : selectE2EFiles(paths);
}

function isNonBrowserTooling(path) {
  return path.startsWith('.github/') || path.startsWith('scripts/') || path.startsWith('infra/');
}

function isContract(path) {
  return (
    path.startsWith('frontend/services/api/src/routes/') ||
    path.startsWith('frontend/services/api/src/openapi/') ||
    path.startsWith('frontend/lib/api/') ||
    path.startsWith('frontend/packages/contracts/')
  );
}

function isSecuritySensitive(path) {
  return (
    path === '.gitleaks.toml' ||
    path === 'frontend/package.json' ||
    path === 'frontend/pnpm-lock.yaml' ||
    path.startsWith('.github/')
  );
}

// Deploy-time inputs: Terraform and workflow definitions are otherwise first
// parsed by the deploy itself.
function isInfra(path) {
  return path.startsWith('infra/') || path.startsWith('.github/workflows/');
}

// The production Worker CSP and consent suite (frontend/playwright.workers.config.ts)
// serves the built app and marketing Workers under local Workerd. It runs for
// their sources and policy owners, its own specs, and any change that selects
// one of the app-suite specs it reruns against the built Workers.
const WORKER_SUITE_SOURCES = [
  'frontend/package.json',
  'frontend/pnpm-lock.yaml',
  'frontend/playwright.workers.config.ts',
  'frontend/e2e/worker-csp.spec.ts',
  'frontend/apps/app/**',
  'frontend/apps/marketing/**',
  'frontend/public/**',
  'frontend/lib/server/**',
  'frontend/lib/config/content-security-policy.ts',
  'frontend/lib/consent/**',
  'frontend/components/analytics/**',
];
const WORKER_SUITE_SPECS = new Set([
  'e2e/marketing-pages.spec.ts',
  'e2e/performance-states.spec.ts',
]);

// What Compose uniquely proves: the images build, and a CLEAN database reaches a
// serving stack. So the trigger is container-shaped changes only -- the images,
// the stack definition, the schema, and anything that changes what gets
// installed into a container. Ordinary application code is not on this list: it
// is already covered by the API, frontend and E2E owners, and across 60
// Compose runs it never caught a failure main CI missed (the one failure, a Next
// prerender error, failed the frontend CI job on the same commit). Note that
// pushes to `main` (unless owner-free) and merge-queue runs classify as `full`
// and therefore smoke the stack regardless of this function.
function isComposeSensitive(path) {
  return (
    path === '.github/workflows/compose-smoke.yml' ||
    path === 'scripts/frontend-ingress-smoke.mjs' ||
    path === '.dockerignore' ||
    path === '.env.example' ||
    // Every image. `frontend/Dockerfile` matched nothing here and reached
    // Compose only via the old "first push of a PR" escalation, so it silently
    // stopped selecting Compose on every later push of the same PR.
    path.endsWith('/Dockerfile') ||
    path.startsWith('docker-compose') ||
    path === 'frontend/package.json' ||
    path === 'frontend/pnpm-lock.yaml' ||
    path.startsWith('frontend/apps/app/') ||
    path.startsWith('frontend/apps/docs/') ||
    path.startsWith('frontend/apps/marketing/') ||
    // Shared server code, including the Worker origin proxy the stack runs.
    path.startsWith('frontend/lib/') ||
    // Only Compose boots the API service's real entry point on its image.
    path.startsWith('frontend/services/')
  );
}

export function classifyPaths(paths, { full = false } = {}) {
  if (full) {
    return {
      frontend: true,
      contract: true,
      api: true,
      e2e: true,
      workers: true,
      security: true,
      infra: true,
      compose: true,
    };
  }

  const normalized = [...new Set(paths.map((path) => path.replaceAll('\\', '/')))];
  const unowned = normalized.filter((path) => !isOwnerFree(path) && !isFrontend(path));
  const shared = unowned.length > 0;
  const e2eFiles = selectE2EFiles(normalized);
  const everyE2E = selectsEveryE2E(normalized);
  const sharedBrowserInput = unowned.some((path) => !isNonBrowserTooling(path));
  const contract = shared || normalized.some(isContract);
  const frontend = shared || contract || normalized.some(isFrontend);

  return {
    frontend,
    contract,
    api: shared || normalized.some(isApiService),
    e2e: sharedBrowserInput || e2eFiles.length > 0 || everyE2E,
    workers:
      sharedBrowserInput ||
      everyE2E ||
      normalized.some((path) => matchesAny(path, WORKER_SUITE_SOURCES)) ||
      e2eFiles.some((spec) => WORKER_SUITE_SPECS.has(spec)),
    security: shared || normalized.some(isSecuritySensitive),
    infra: normalized.some(isInfra),
    compose: normalized.some(isComposeSensitive),
  };
}

/** True only for a known, non-empty change that touches no owner. */
export function isOwnerFreeChange(paths) {
  return paths.length > 0 && paths.every((path) => isOwnerFree(path.replaceAll('\\', '/')));
}

export function selectDiff({
  eventName,
  action,
  beforeSha,
  baseSha,
  headSha,
  previousRunTrusted = true,
  beforeIsAncestor = true,
}) {
  const usableBefore = beforeSha && !/^0+$/.test(beforeSha);
  if (eventName !== 'pull_request') {
    // Main stays a full validation; the push range only lets an owner-free
    // push (documentation or inert configuration) skip it, and only when this
    // workflow already passed on the previous main commit. Otherwise a green
    // owner-free push would vouch for code whose own run failed or never ran,
    // and the deploy gate reads only the exact deployed commit's run.
    const range = eventName === 'push' && usableBefore && beforeIsAncestor && previousRunTrusted;
    return { full: true, range: range ? `${beforeSha}..${headSha}` : null };
  }
  // A force-push (rebase or amend) orphans the previous head, so its incremental
  // diff is neither fetchable nor meaningful; revalidate the cumulative PR scope.
  if (action === 'synchronize' && usableBefore && previousRunTrusted && beforeIsAncestor) {
    return { full: false, range: `${beforeSha}..${headSha}` };
  }
  if (!baseSha) throw new Error('CI_BASE_SHA is required for the initial pull-request diff.');
  return { full: false, range: `${baseSha}...${headSha}` };
}

function isAncestor(ancestorSha, descendantSha) {
  if (!ancestorSha || !descendantSha) return false;
  try {
    execFileSync(GIT_EXECUTABLE, ['merge-base', '--is-ancestor', ancestorSha, descendantSha], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function changedPaths(range) {
  if (!range) return [];
  const output = execFileSync(
    GIT_EXECUTABLE,
    ['diff', '--no-renames', '--name-only', '--diff-filter=ACMDT', range],
    { encoding: 'utf8' },
  );
  return output.split(/\r?\n/u).filter(Boolean);
}

export function hasTrustworthyJobEvidence(jobs, workflowFile) {
  if (!Array.isArray(jobs)) return false;
  const compose = workflowFile === 'compose-smoke.yml';
  const expectedNames = compose
    ? ['Classify affected owners', 'Clean-clone Compose smoke']
    : [
        'Classify affected owners',
        'Frontend (quality, docs)',
        'API contract and ingress',
        'API service (TypeScript)',
        'E2E (playwright)',
        'Worker CSP and consent (playwright)',
        'Security (secrets scan)',
        'Infra (Terraform and workflows)',
        'CI result',
      ];
  // Matrix jobs report one job per shard, named `<family> (<shard>/<count>)`; a
  // skipped matrix reports a single job. Each family needs at least one job.
  const matrixFamilies = compose ? [] : ['Frontend tests', 'API service tests'];
  const familyOf = (name) =>
    matrixFamilies.find((family) => typeof name === 'string' && name.startsWith(`${family} (`));
  const singles = jobs.filter((job) => !familyOf(job.name));
  const singlesByName = new Map(singles.map((job) => [job.name, job]));
  const settled = (job) =>
    job?.status === 'completed' && ['success', 'skipped'].includes(job.conclusion);
  return (
    singles.length === expectedNames.length &&
    singlesByName.size === expectedNames.length &&
    singlesByName.get('Classify affected owners')?.conclusion === 'success' &&
    expectedNames.every((name) => settled(singlesByName.get(name))) &&
    matrixFamilies.every((family) => jobs.some((job) => familyOf(job.name) === family)) &&
    jobs.every(settled)
  );
}

/**
 * True when the newest `main` push run of this workflow for the previous
 * commit completed successfully. That run was itself either a full validation
 * or an owner-free push vouched for the same way, so success is inductive.
 */
export function previousMainRunPassed(runs, beforeSha) {
  if (!Array.isArray(runs)) return false;
  const previous = runs
    .filter((run) => run.head_sha === beforeSha && run.event === 'push')
    .sort((left, right) => right.run_number - left.run_number)[0];
  return previous?.status === 'completed' && previous.conclusion === 'success';
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function previousMainRunIsTrusted(environment) {
  const token = environment.GITHUB_TOKEN;
  const repository = environment.GITHUB_REPOSITORY;
  const workflowFile = environment.CI_WORKFLOW_FILE;
  if (!token || !repository || !workflowFile) return false;
  const runsUrl = new URL(
    `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs`,
  );
  runsUrl.searchParams.set('event', 'push');
  runsUrl.searchParams.set('branch', 'main');
  runsUrl.searchParams.set('head_sha', environment.CI_BEFORE_SHA);
  runsUrl.searchParams.set('per_page', '30');
  const response = await fetch(runsUrl, { headers: githubHeaders(token) });
  if (!response.ok) throw new Error(`workflow-runs query returned ${response.status}`);
  const runs = await response.json();
  return previousMainRunPassed(runs.workflow_runs, environment.CI_BEFORE_SHA);
}

async function previousRunIsTrusted(environment) {
  if (!environment.CI_BEFORE_SHA || /^0+$/u.test(environment.CI_BEFORE_SHA)) return true;
  if (environment.GITHUB_EVENT_NAME === 'push') return previousMainRunIsTrusted(environment);
  if (environment.GITHUB_EVENT_ACTION !== 'synchronize') return true;
  const token = environment.GITHUB_TOKEN;
  const repository = environment.GITHUB_REPOSITORY;
  const workflowFile = environment.CI_WORKFLOW_FILE;
  if (!token || !repository || !workflowFile) return false;

  const headers = githubHeaders(token);
  const runsUrl = new URL(
    `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs`,
  );
  runsUrl.searchParams.set('event', 'pull_request');
  runsUrl.searchParams.set('per_page', '30');
  if (environment.CI_HEAD_REF) runsUrl.searchParams.set('branch', environment.CI_HEAD_REF);

  const runsResponse = await fetch(runsUrl, { headers });
  if (!runsResponse.ok) throw new Error(`workflow-runs query returned ${runsResponse.status}`);
  const runs = await runsResponse.json();
  const previous = runs.workflow_runs.find((run) => run.head_sha === environment.CI_BEFORE_SHA);
  if (previous?.status !== 'completed') return false;

  const jobsResponse = await fetch(
    `https://api.github.com/repos/${repository}/actions/runs/${previous.id}/jobs?per_page=100`,
    { headers },
  );
  if (!jobsResponse.ok) throw new Error(`workflow-jobs query returned ${jobsResponse.status}`);
  const jobs = await jobsResponse.json();
  if (
    !Array.isArray(jobs.jobs) ||
    (Number.isInteger(jobs.total_count) && jobs.total_count > jobs.jobs.length) ||
    !hasTrustworthyJobEvidence(jobs.jobs, workflowFile)
  ) {
    return false;
  }
  return true;
}

function writeOutputs(result, outputPath, e2eFiles) {
  const lines = Object.entries(result).map(
    ([name, enabled]) => `${name}=${enabled ? TRUE : FALSE}`,
  );
  lines.push(`e2e_args=${e2eFiles.join(' ')}`);
  appendFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

async function main(environment = process.env) {
  let previousRunTrusted = true;
  try {
    previousRunTrusted = await previousRunIsTrusted(environment);
  } catch (error) {
    previousRunTrusted = false;
    process.stderr.write(
      `Unable to read the previous CI result; validating the full scope: ${error.message}\n`,
    );
  }

  const diff = selectDiff({
    eventName: environment.GITHUB_EVENT_NAME,
    action: environment.GITHUB_EVENT_ACTION,
    beforeSha: environment.CI_BEFORE_SHA,
    baseSha: environment.CI_BASE_SHA,
    headSha: environment.CI_HEAD_SHA,
    previousRunTrusted,
    beforeIsAncestor: isAncestor(environment.CI_BEFORE_SHA, environment.CI_HEAD_SHA),
  });
  const paths = changedPaths(diff.range);
  const full = diff.full && !isOwnerFreeChange(paths);
  const result = classifyPaths(paths, { full });
  const e2eFiles = full ? [] : e2eSpecArgs(paths);

  process.stdout.write(
    `CI diff: ${full ? 'full main validation' : diff.range}; ${paths.length} changed path(s)\n`,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!environment.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  writeOutputs(result, environment.GITHUB_OUTPUT, e2eFiles);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
