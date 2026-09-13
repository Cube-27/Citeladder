#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TRUE = 'true';
const FALSE = 'false';
const GIT_EXECUTABLE =
  process.platform === 'win32' ? String.raw`C:\Program Files\Git\cmd\git.exe` : '/usr/bin/git';
const VALIDATION = JSON.parse(readFileSync(new URL('./validation.json', import.meta.url), 'utf8'));
const DOC_FILES = new Set([
  'AGENTS.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'PRODUCT.md',
  'README.md',
  'Review.md',
]);

function isDocumentation(path) {
  return path.startsWith('docs/') || DOC_FILES.has(path);
}

function isBackend(path) {
  return path.startsWith('backend/') || path.startsWith('migrations/') || path === 'reset-db.py';
}

function isFrontend(path) {
  return path.startsWith('frontend/');
}

function globRegex(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; ) {
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
      source += pattern[index].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      index += 1;
    }
  }
  return new RegExp(`${source}$`, 'u');
}

function matchesAny(path, patterns) {
  return patterns.some((pattern) => globRegex(pattern).test(path));
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
    if (
      /^frontend\/e2e\/.+\.spec\.ts$/u.test(path) &&
      path !== 'frontend/e2e/content-integration.spec.ts'
    ) {
      addTest(path.slice('frontend/'.length));
    }
    for (const rule of VALIDATION.rules) {
      if (rule.frontendE2E && matchesAny(path, rule.sources)) {
        for (const test of rule.frontendE2E) addTest(test);
      }
    }
  }
  return [...selected].sort();
}

function isNonBrowserTooling(path) {
  return (
    path.startsWith('.github/') ||
    path.startsWith('scripts/') ||
    path.startsWith('infra/') ||
    /^reset-.+\.(py|ps1)$/u.test(path)
  );
}

function isContract(path) {
  return (
    path.startsWith('backend/app/api/') ||
    path === 'backend/app/main.py' ||
    /^backend\/app\/.+\/[^/]*schemas?\.py$/.test(path) ||
    path === 'backend/scripts/export_openapi.py' ||
    path.startsWith('frontend/lib/api/')
  );
}

function isSecuritySensitive(path) {
  return (
    path === '.secrets.baseline' ||
    path === 'backend/pyproject.toml' ||
    path === 'backend/uv.lock' ||
    path === 'frontend/package.json' ||
    path === 'frontend/pnpm-lock.yaml' ||
    path.startsWith('.github/')
  );
}

// What Compose uniquely proves: the images build, and a CLEAN database reaches a
// serving stack. So the trigger is container-shaped changes only -- the images,
// the stack definition, the schema, and anything that changes what gets
// installed into a container. Ordinary application code is not on this list: it
// is already covered by the backend, frontend and E2E owners, and across 60
// Compose runs it never caught a failure main CI missed (the one failure, a Next
// prerender error, failed the frontend CI job on the same commit). Note that
// pushes to `main` and merge-queue runs classify as `full` and therefore always
// smoke the stack regardless of this function -- narrowing applies to PR runs.
function isComposeSensitive(path) {
  return (
    path === '.github/workflows/compose-smoke.yml' ||
    path === '.dockerignore' ||
    path === '.env.example' ||
    // Both images. `frontend/Dockerfile` matched nothing here and reached
    // Compose only via the old "first push of a PR" escalation, so it silently
    // stopped selecting Compose on every later push of the same PR.
    path === 'Dockerfile' ||
    path.endsWith('/Dockerfile') ||
    path.startsWith('docker-compose') ||
    path.startsWith('migrations/') ||
    // The migrate service runs `alembic upgrade head`, and `up` blocks on it.
    path === 'backend/alembic.ini' ||
    path === 'backend/pyproject.toml' ||
    path === 'backend/uv.lock' ||
    path === 'frontend/package.json' ||
    path === 'frontend/pnpm-lock.yaml' ||
    path === 'frontend/next.config.ts'
  );
}

export function classifyPaths(paths, { full = false } = {}) {
  if (full) {
    return {
      backend: true,
      frontend: true,
      contract: true,
      e2e: true,
      security: true,
      compose: true,
    };
  }

  const normalized = [...new Set(paths.map((path) => path.replaceAll('\\', '/')))];
  const unowned = normalized.filter(
    (path) => !isDocumentation(path) && !isBackend(path) && !isFrontend(path),
  );
  const shared = unowned.length > 0;
  const e2eFiles = selectE2EFiles(normalized);
  const contract = shared || normalized.some(isContract);
  const backend = shared || contract || normalized.some(isBackend);
  const frontend = shared || contract || normalized.some(isFrontend);

  return {
    backend,
    frontend,
    contract,
    e2e: unowned.some((path) => !isNonBrowserTooling(path)) || e2eFiles.length > 0,
    security: shared || normalized.some(isSecuritySensitive),
    compose: normalized.some(isComposeSensitive),
  };
}

export function selectDiff({ eventName, action, beforeSha, baseSha, headSha, previousRunTrusted = true }) {
  if (eventName !== 'pull_request') return { full: true, range: null };

  const usableBefore = beforeSha && !/^0+$/.test(beforeSha);
  if (action === 'synchronize' && usableBefore && previousRunTrusted) {
    return { full: false, range: `${beforeSha}..${headSha}` };
  }
  if (!baseSha) throw new Error('CI_BASE_SHA is required for the initial pull-request diff.');
  return { full: false, range: `${baseSha}...${headSha}` };
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
  const expectedNames =
    workflowFile === 'compose-smoke.yml'
      ? ['Classify affected owners', 'Clean-clone Compose smoke']
      : [
          'Classify affected owners',
          'Backend (quality, pytest)',
          'Frontend (quality, coverage, build)',
          'API contract (backend to frontend)',
          'E2E (playwright)',
          'Security (pip-audit, detect-secrets)',
        ];
  const jobsByName = new Map(jobs.map((job) => [job.name, job]));
  const classifier = jobsByName.get('Classify affected owners');
  return (
    jobs.length === expectedNames.length &&
    jobsByName.size === expectedNames.length &&
    classifier?.conclusion === 'success' &&
    expectedNames.every((name) => {
      const job = jobsByName.get(name);
      return job?.status === 'completed' && ['success', 'skipped'].includes(job.conclusion);
    })
  );
}

async function previousRunIsTrusted(environment) {
  if (environment.GITHUB_EVENT_ACTION !== 'synchronize' || !environment.CI_BEFORE_SHA) {
    return true;
  }
  const token = environment.GITHUB_TOKEN;
  const repository = environment.GITHUB_REPOSITORY;
  const workflowFile = environment.CI_WORKFLOW_FILE;
  if (!token || !repository || !workflowFile) return false;

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
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
  if (!previous || previous.status !== 'completed') return false;

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
  const lines = Object.entries(result).map(([name, enabled]) => `${name}=${enabled ? TRUE : FALSE}`);
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
      `Unable to read the previous CI result; using the cumulative PR scope: ${error.message}\n`,
    );
  }

  const diff = selectDiff({
    eventName: environment.GITHUB_EVENT_NAME,
    action: environment.GITHUB_EVENT_ACTION,
    beforeSha: environment.CI_BEFORE_SHA,
    baseSha: environment.CI_BASE_SHA,
    headSha: environment.CI_HEAD_SHA,
    previousRunTrusted,
  });
  const paths = changedPaths(diff.range);
  const result = classifyPaths(paths, diff);
  const e2eFiles = diff.full ? [] : selectE2EFiles(paths);

  process.stdout.write(
    `CI diff: ${diff.full ? 'full main validation' : diff.range}; ${paths.length} changed path(s)\n`,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!environment.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  writeOutputs(result, environment.GITHUB_OUTPUT, e2eFiles);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
