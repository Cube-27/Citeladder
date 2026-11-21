import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyPaths,
  e2eSpecArgs,
  hasTrustworthyJobEvidence,
  isOwnerFreeChange,
  matchesAny,
  previousMainRunPassed,
  selectE2EFiles,
  selectDiff,
} from './ci-changes.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

test('frontend paths select only their owning suites', () => {
  assert.deepEqual(classifyPaths(['frontend/components/card.tsx']), {
    frontend: true,
    contract: false,
    api: false,
    e2e: false,
    workers: false,
    security: false,
    infra: false,
    compose: false,
  });
});

test('browser-sensitive frontend paths select E2E without escalating every frontend edit', () => {
  assert.equal(classifyPaths(['frontend/components/card.tsx']).e2e, false);
  assert.equal(classifyPaths(['frontend/components/ui/button.tsx']).e2e, false);
  assert.equal(classifyPaths(['frontend/components/ui/command-palette.tsx']).e2e, true);
  assert.equal(classifyPaths(['frontend/components/ui/primitives.test.tsx']).e2e, false);
  assert.equal(classifyPaths(['frontend/lib/api/projects.ts']).e2e, false);
  assert.deepEqual(
    selectE2EFiles(['frontend/components/opportunities/verification-observations.tsx']),
    ['e2e/action-loop.spec.ts'],
  );
  assert.deepEqual(
    selectE2EFiles([
      'frontend/components/agent/chat-screen.tsx',
      'frontend/lib/agent/next-steps.ts',
    ]),
    ['e2e/action-loop.spec.ts', 'e2e/agent-conversation.spec.ts', 'e2e/page-workspace.spec.ts'],
  );
  assert.deepEqual(selectE2EFiles(['frontend/components/ui/button.tsx']), []);
  assert.deepEqual(selectE2EFiles(['frontend/components/agent/new-chat-screen.tsx']), [
    'e2e/action-loop.spec.ts',
    'e2e/agent-conversation.spec.ts',
    'e2e/surface-layout.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/components/ui/command-palette.tsx']), [
    'e2e/shell.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/components/templates/page-frame.tsx']), [
    'e2e/geometry-census.spec.ts',
    'e2e/shell.spec.ts',
    'e2e/surface-layout-actions.spec.ts',
    'e2e/surface-layout-issues.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/e2e/shell.spec.ts']), ['e2e/shell.spec.ts']);
  assert.deepEqual(selectE2EFiles(['frontend/e2e/shell.spec.mjs']), []);
  assert.deepEqual(
    selectE2EFiles([
      'frontend/e2e/docs.spec.ts',
      'frontend/e2e/worker-csp.spec.ts',
      'frontend/e2e/shell.spec.ts',
    ]),
    ['e2e/shell.spec.ts'],
  );
  assert.equal(classifyPaths(['frontend/e2e/docs.spec.ts']).e2e, false);
  assert.equal(
    classifyPaths(['scripts/quality.mjs', '.github/workflows/compose-smoke.yml']).e2e,
    false,
  );
});

test('the browser jobs run in full when their workflow or setup action changes', () => {
  for (const path of ['.github/workflows/ci.yml', '.github/actions/setup-frontend/action.yml']) {
    const selected = classifyPaths([path]);
    assert.deepEqual([selected.e2e, selected.workers], [true, true], path);
    assert.deepEqual(e2eSpecArgs([path, 'frontend/components/performance/metric-cards.tsx']), []);
  }
  assert.deepEqual(e2eSpecArgs(['frontend/components/performance/metric-cards.tsx']), [
    'e2e/performance-states.spec.ts',
  ]);
});

test('billing selects existing browser suites and browser configuration runs every suite', () => {
  const available = new Set(
    readdirSync(new URL('../frontend/e2e/', import.meta.url))
      .filter((name) => name.endsWith('.spec.ts'))
      .map((name) => `e2e/${name}`),
  );
  const path = 'frontend/lib/billing/entitlement-context.tsx';
  const selected = selectE2EFiles([path]);
  assert.ok(selected.length > 0, `${path} must retain browser coverage`);
  for (const spec of selected) assert.ok(available.has(spec), `${path} selected missing ${spec}`);

  assert.equal(classifyPaths(['frontend/playwright.config.ts']).e2e, true);
  assert.deepEqual(e2eSpecArgs(['frontend/playwright.config.ts']), []);
});

test('native contracts select API and browser checks without schema checks', () => {
  for (const path of [
    'frontend/services/api/src/routes/projects.ts',
    'frontend/services/api/src/openapi/routes.ts',
    'frontend/lib/api/projects.ts',
    'frontend/packages/contracts/src/project.ts',
  ]) {
    const result = classifyPaths([path]);
    assert.equal(result.frontend, true, path);
    assert.equal(result.contract, true, path);
  }
  assert.equal(classifyPaths(['scripts/quality.mjs']).api, true);
});

test('the SQL schema baseline selects the native API and the Compose smoke', () => {
  const result = classifyPaths(['frontend/services/api/migrations/0001_baseline.sql']);
  assert.equal(result.api, true);
  assert.equal(result.compose, true);
  assert.equal(result.contract, false);
});

test('the native API runs for its code and canonical schema inputs', () => {
  for (const path of [
    'frontend/services/api/src/app.ts',
    'frontend/services/api/assets/agent-skills/skills/gsc_optimize/SKILL.md',
    'frontend/pnpm-lock.yaml',
    'frontend/services/api/migrations/0001_baseline.sql',
    'frontend/packages/contracts/src/route-ownership.ts',
    'frontend/services/api/src/routes/projects.ts',
  ]) {
    assert.equal(classifyPaths([path]).api, true, path);
  }
  for (const path of ['frontend/components/card.tsx', 'frontend/apps/app/src/main.tsx']) {
    assert.equal(classifyPaths([path]).api, false, path);
  }
  assert.equal(classifyPaths(['frontend/services/api/src/server.ts']).compose, true);
});

function apiExternalReads() {
  const reference = /(?:\bfrom\s*|\bimport\s*\(\s*|\bnew URL\(\s*)'(\.\.?\/[^'`$]+)'/gu;
  const reads = new Set();
  for (const directory of ['src', 'scripts', 'test']) {
    const root = join(repositoryRoot, 'frontend/services/api', directory);
    for (const name of readdirSync(root, { recursive: true })) {
      const file = posix.join('frontend/services/api', directory, name);
      if (!/\.[cm]?[jt]s$/u.test(file) || file.includes('/fixtures/')) continue;
      const source = readFileSync(join(repositoryRoot, file), 'utf8');
      for (const [, specifier] of source.matchAll(reference)) {
        const target = posix.normalize(posix.join(posix.dirname(file), specifier));
        if (['.', './', 'frontend/'].includes(target)) continue;
        if (/^frontend\/(?:services|packages)\//u.test(target) || target.startsWith('..')) continue;
        const absolute = join(repositoryRoot, target);
        if (!existsSync(absolute)) continue;
        if (!statSync(absolute).isDirectory()) reads.add(target.replace(/\/$/u, ''));
        else {
          for (const entry of readdirSync(absolute, { recursive: true, withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const path = join(entry.parentPath, entry.name).slice(repositoryRoot.length);
            reads.add(path);
          }
        }
      }
    }
  }
  return [...reads].sort();
}

test('every frontend file the API reads outside its package selects the API suite', () => {
  const reads = apiExternalReads();
  for (const path of [
    'frontend/apps/app/src/globals.css',
    'frontend/apps/docs/public/templates/citeladder-crawl-log-worker.js',
    'frontend/apps/docs/src/data/public-api.json',
    'frontend/vp-shared-config.ts',
  ]) {
    assert.ok(reads.includes(path), `the API read scan missed ${path}`);
  }
  for (const path of reads) assert.equal(classifyPaths([path]).api, true, path);
  assert.equal(classifyPaths(['frontend/apps/app/src/router.tsx']).api, false);
});

test('the ratchet scripts the API quality step runs select the API owner', () => {
  const owners = classifyPaths(['frontend/scripts/check-complexity.mjs']);
  assert.deepEqual([owners.frontend, owners.api], [true, true]);
  assert.equal(classifyPaths(['frontend/scripts/check-design-system.mjs']).api, false);
});

const e2eRules = JSON.parse(readFileSync(new URL('./e2e-paths.json', import.meta.url), 'utf8'));
const appSuiteSpecs = readdirSync(new URL('../frontend/e2e/', import.meta.url))
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => `e2e/${name}`)
  .filter((spec) => !['e2e/docs.spec.ts', 'e2e/worker-csp.spec.ts'].includes(spec));

test('every app E2E spec is selected by the product sources it exercises', () => {
  const mapped = new Set(
    e2eRules.flatMap((rule) => (Array.isArray(rule.frontendE2E) ? rule.frontendE2E : [])),
  );
  assert.deepEqual(
    appSuiteSpecs.filter((spec) => !mapped.has(spec)),
    [],
  );
  assert.deepEqual(selectE2EFiles(['frontend/components/prompts/prompt-library.tsx']), [
    'e2e/geometry-census.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/components/performance/metric-cards.tsx']), [
    'e2e/performance-states.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/components/site-health/issues-screen.tsx']), [
    'e2e/site-health-recovery.spec.ts',
    'e2e/surface-layout-issues.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/components/agent/workspace/page-editor.tsx']), [
    'e2e/action-loop.spec.ts',
    'e2e/agent-conversation.spec.ts',
    'e2e/page-workspace.spec.ts',
  ]);
});

test('every E2E path rule names files that exist', () => {
  const tracked = execFileSync('git', ['ls-files', 'frontend'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).split('\n');
  const dead = e2eRules
    .flatMap((rule) => rule.sources)
    .filter((source) => !tracked.some((path) => matchesAny(path, [source])));
  assert.deepEqual(dead, []);
  for (const spec of appSuiteSpecs) {
    assert.ok(tracked.includes(`frontend/${spec}`), spec);
  }
});

test('a fixture or helper change selects every spec that imports it', () => {
  const fixtureUsers = [
    'e2e/action-loop.spec.ts',
    'e2e/agent-conversation.spec.ts',
    'e2e/design-repair.spec.ts',
    'e2e/first-frame-transitions.spec.ts',
    'e2e/geometry-census.spec.ts',
    'e2e/page-workspace.spec.ts',
    'e2e/performance-states.spec.ts',
    'e2e/providers.spec.ts',
    'e2e/runs.spec.ts',
    'e2e/search-intelligence.spec.ts',
    'e2e/self-serve-auth.spec.ts',
    'e2e/shell.spec.ts',
    'e2e/site-health-recovery.spec.ts',
    'e2e/surface-layout-actions.spec.ts',
    'e2e/surface-layout-issues.spec.ts',
    'e2e/surface-layout.spec.ts',
    'e2e/visibility.spec.ts',
  ];
  assert.deepEqual(selectE2EFiles(['frontend/e2e/helpers/app-fixture.ts']), fixtureUsers);
  assert.deepEqual(selectE2EFiles(['frontend/test/fixtures/project.ts']), fixtureUsers);
  assert.deepEqual(selectE2EFiles(['frontend/test/agent-chat-fixture.ts']), [
    'e2e/agent-conversation.spec.ts',
    'e2e/page-workspace.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/lib/fonts/brand-fonts.ts']), [
    'e2e/marketing-pages.spec.ts',
  ]);
});

test('the production Worker suite runs for the built Workers and the specs it reruns', () => {
  for (const path of [
    'frontend/apps/app/worker.ts',
    'frontend/apps/marketing/src/site-headers.ts',
    'frontend/lib/config/content-security-policy.ts',
    'frontend/lib/consent/cookie-consent.ts',
    'frontend/e2e/worker-csp.spec.ts',
    'frontend/playwright.workers.config.ts',
    'frontend/components/performance/metric-cards.tsx',
    'frontend/playwright.config.ts',
  ]) {
    assert.equal(classifyPaths([path]).workers, true, path);
  }
  for (const path of [
    'frontend/components/card.tsx',
    'frontend/components/site-health/issues-screen.tsx',
    'scripts/quality.mjs',
    'docs/DEVELOPMENT.md',
  ]) {
    assert.equal(classifyPaths([path]).workers, false, path);
  }
  assert.equal(classifyPaths([], { full: true }).workers, true);
});

test('documentation-only changes avoid implementation suites', () => {
  assert.deepEqual(classifyPaths(['docs/DEVELOPMENT.md', 'README.md']), {
    frontend: false,
    contract: false,
    api: false,
    e2e: false,
    workers: false,
    security: false,
    infra: false,
    compose: false,
  });
});

test('external-service and deploy-only configuration runs only the security and infra owners', () => {
  assert.deepEqual(
    classifyPaths(['.sonarcloud.properties', '.github/workflows/gcp-deploy.yml', 'docs/x.md']),
    {
      frontend: false,
      contract: false,
      api: false,
      e2e: false,
      workers: false,
      security: true,
      infra: true,
      compose: false,
    },
  );
  assert.equal(classifyPaths(['.github/workflows/ci.yml']).api, true);
});

test('the API host deploy and the deploy gate run no owner suite', () => {
  for (const path of [
    '.github/workflows/workers-api-host-deploy.yml',
    '.github/actions/require-green-main/action.yml',
  ]) {
    assert.equal(isOwnerFreeChange([path]), true, path);
    assert.equal(classifyPaths([path]).api, false, path);
  }
  assert.equal(classifyPaths(['.github/actions/setup-frontend/action.yml']).api, true);
});

test('a shared contract change runs every E2E spec', () => {
  const paths = [
    'frontend/packages/contracts/src/search-intelligence.ts',
    'frontend/components/ui/command-palette.tsx',
  ];
  assert.equal(classifyPaths(paths).e2e, true);
  assert.deepEqual(e2eSpecArgs(paths), []);
  assert.deepEqual(e2eSpecArgs(['frontend/components/ui/command-palette.tsx']), [
    'e2e/shell.spec.ts',
  ]);
  assert.equal(classifyPaths(['frontend/lib/api/projects.ts']).e2e, false);
});

test('a Search Intelligence view change runs its E2E spec', () => {
  const path = 'frontend/components/search-intelligence/search-intelligence-dataset-view.tsx';
  assert.equal(classifyPaths([path]).e2e, true);
  assert.deepEqual(e2eSpecArgs([path]), ['e2e/search-intelligence.spec.ts']);
  assert.deepEqual(e2eSpecArgs(['frontend/lib/api/search-intelligence.ts']), [
    'e2e/search-intelligence.spec.ts',
  ]);
});

test('Terraform and workflow changes are validated before deploy', () => {
  assert.equal(classifyPaths(['infra/gcp/run.tf']).infra, true);
  assert.equal(classifyPaths(['.github/workflows/compose-smoke.yml']).infra, true);
  assert.equal(classifyPaths(['frontend/services/api/src/app.ts']).infra, false);
  assert.equal(classifyPaths(['scripts/quality.mjs']).infra, false);
});

test('main skips full validation only for an owner-free push', () => {
  assert.equal(isOwnerFreeChange(['docs/README.md', '.sonarcloud.properties']), true);
  assert.equal(isOwnerFreeChange(['docs/README.md', 'frontend/components/card.tsx']), false);
  assert.equal(isOwnerFreeChange([]), false);
});

test('root governance and product prose avoid implementation suites', () => {
  assert.deepEqual(classifyPaths(['CLAUDE.md', 'PRODUCT.md']), {
    frontend: false,
    contract: false,
    api: false,
    e2e: false,
    workers: false,
    security: false,
    infra: false,
    compose: false,
  });
});

test('packaged Agent skills select their native API and image owners', () => {
  assert.deepEqual(
    classifyPaths(['frontend/services/api/assets/agent-skills/skills/gsc_optimize/SKILL.md']),
    {
      frontend: true,
      contract: false,
      api: true,
      e2e: false,
      workers: false,
      security: false,
      infra: false,
      compose: true,
    },
  );
});

test('Compose selects container-shaped changes only, on every push of a PR', () => {
  for (const path of ['frontend/components/card.tsx', 'scripts/quality.mjs']) {
    assert.equal(classifyPaths([path], { initial: true }).compose, false, path);
    assert.equal(classifyPaths([path]).compose, false, path);
  }
  assert.equal(classifyPaths([], { full: true }).compose, true);

  for (const path of [
    'frontend/Dockerfile',
    'frontend/services/api/Dockerfile',
    'docker-compose.yml',
    '.dockerignore',
    '.env.example',
    'frontend/services/api/migrations/0001_baseline.sql',
    'frontend/package.json',
    'frontend/pnpm-lock.yaml',
    'frontend/apps/app/vite.config.ts',
    'frontend/apps/marketing/astro.config.mjs',
    'frontend/apps/docs/astro.config.mjs',
    'frontend/lib/server/worker-origin-proxy.ts',
    'scripts/frontend-ingress-smoke.mjs',
    '.github/workflows/compose-smoke.yml',
  ]) {
    assert.equal(classifyPaths([path]).compose, true, path);
  }
});

test('previous CI evidence requires every owner to be successful or intentionally skipped', () => {
  const complete = [
    { name: 'Classify affected owners', status: 'completed', conclusion: 'success' },
    ...[
      'Frontend (quality, docs)',
      'API contract and ingress',
      'API service (TypeScript)',
      'E2E (playwright)',
      'Worker CSP and consent (playwright)',
      'Security (secrets scan)',
      'Infra (Terraform and workflows)',
      'Frontend tests (1/3)',
      'Frontend tests (2/3)',
      'Frontend tests (3/3)',
      'API service tests (${{ matrix.shard }}/6)',
    ].map((name) => ({ name, status: 'completed', conclusion: 'skipped' })),
    { name: 'CI result', status: 'completed', conclusion: 'success' },
  ];
  assert.equal(hasTrustworthyJobEvidence(complete, 'ci.yml'), true);
  assert.equal(
    hasTrustworthyJobEvidence(
      complete.map((job) => (job.name === 'CI result' ? { ...job, conclusion: 'skipped' } : job)),
      'ci.yml',
    ),
    false,
  );
  assert.equal(
    hasTrustworthyJobEvidence(
      complete.map((job) =>
        job.name === 'Frontend tests (2/3)' ? { ...job, conclusion: 'failure' } : job,
      ),
      'ci.yml',
    ),
    false,
  );
  assert.equal(
    hasTrustworthyJobEvidence(
      complete.filter((job) => !job.name.startsWith('API service tests (')),
      'ci.yml',
    ),
    false,
  );
  assert.equal(
    hasTrustworthyJobEvidence(
      complete.map((job) =>
        job.name === 'Frontend (quality, docs)' ? { ...job, conclusion: 'failure' } : job,
      ),
      'ci.yml',
    ),
    false,
  );
  assert.equal(hasTrustworthyJobEvidence(complete.slice(0, -1), 'ci.yml'), false);
  assert.equal(
    hasTrustworthyJobEvidence(
      [
        ...complete,
        { name: 'Unlisted aggregate gate', status: 'completed', conclusion: 'success' },
      ],
      'ci.yml',
    ),
    false,
  );
  assert.equal(
    hasTrustworthyJobEvidence(
      complete.map((job) =>
        job.name === 'Classify affected owners' ? { ...job, name: 'Classify latest push' } : job,
      ),
      'ci.yml',
    ),
    false,
  );
});

test('previous Compose evidence needs its classifier, the smoke and the aggregate result', () => {
  const job = (name, conclusion = 'success') => ({ name, status: 'completed', conclusion });
  const complete = [
    job('Classify affected owners'),
    job('Clean-clone Compose smoke', 'skipped'),
    job('Compose smoke result'),
  ];
  assert.equal(hasTrustworthyJobEvidence(complete, 'compose-smoke.yml'), true);
  assert.equal(hasTrustworthyJobEvidence(complete.slice(0, 2), 'compose-smoke.yml'), false);
  for (const conclusion of ['failure', 'skipped'])
    assert.equal(
      hasTrustworthyJobEvidence(
        [complete[0], complete[1], job('Compose smoke result', conclusion)],
        'compose-smoke.yml',
      ),
      false,
      conclusion,
    );
});

test('pull-request synchronization uses latest-push diff and main is full', () => {
  assert.deepEqual(
    selectDiff({
      eventName: 'pull_request',
      action: 'synchronize',
      beforeSha: 'before',
      baseSha: 'base',
      headSha: 'head',
    }),
    { full: false, range: 'before..head' },
  );
  assert.deepEqual(
    selectDiff({
      eventName: 'pull_request',
      action: 'synchronize',
      beforeSha: 'before',
      baseSha: 'base',
      headSha: 'head',
      previousRunTrusted: false,
    }),
    { full: false, range: 'base...head' },
  );
  assert.deepEqual(
    selectDiff({
      eventName: 'pull_request',
      action: 'synchronize',
      beforeSha: 'before',
      baseSha: 'base',
      headSha: 'head',
      beforeIsAncestor: false,
    }),
    { full: false, range: 'base...head' },
  );
  for (const eventName of ['push', 'workflow_dispatch', 'merge_group']) {
    assert.deepEqual(selectDiff({ eventName }), { full: true, range: null }, eventName);
  }
  assert.deepEqual(selectDiff({ eventName: 'push', beforeSha: 'before', headSha: 'head' }), {
    full: true,
    range: 'before..head',
  });
  assert.deepEqual(
    selectDiff({
      eventName: 'push',
      beforeSha: 'before',
      headSha: 'head',
      beforeIsAncestor: false,
    }),
    { full: true, range: null },
  );
  assert.deepEqual(
    selectDiff({
      eventName: 'push',
      beforeSha: 'before',
      headSha: 'head',
      previousRunTrusted: false,
    }),
    { full: true, range: null },
  );
});

test('an owner-free main push is vouched for only by a passed run on the previous commit', () => {
  const run = (overrides) => ({
    head_sha: 'before',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    run_number: 1,
    ...overrides,
  });
  assert.equal(previousMainRunPassed([run({})], 'before'), true);
  assert.equal(previousMainRunPassed([run({ conclusion: 'failure' })], 'before'), false);
  assert.equal(previousMainRunPassed([run({ conclusion: 'cancelled' })], 'before'), false);
  assert.equal(
    previousMainRunPassed([run({ status: 'in_progress', conclusion: null })], 'before'),
    false,
  );
  assert.equal(previousMainRunPassed([run({ head_sha: 'other' })], 'before'), false);
  assert.equal(previousMainRunPassed([run({ event: 'workflow_dispatch' })], 'before'), false);
  assert.equal(previousMainRunPassed([], 'before'), false);
  assert.equal(
    previousMainRunPassed(
      [run({ run_number: 1 }), run({ run_number: 2, conclusion: 'failure' })],
      'before',
    ),
    false,
  );
});
