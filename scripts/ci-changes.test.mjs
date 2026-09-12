import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyPaths,
  hasTrustworthyJobEvidence,
  selectE2EFiles,
  selectDiff,
} from './ci-changes.mjs';

test('backend and frontend paths select only their owning suites', () => {
  assert.deepEqual(classifyPaths(['backend/app/analysis/costs.py']), {
    backend: true,
    frontend: false,
    contract: false,
    e2e: false,
    security: false,
    compose: false,
  });
  assert.deepEqual(classifyPaths(['frontend/components/card.tsx']), {
    backend: false,
    frontend: true,
    contract: false,
    e2e: false,
    security: false,
    compose: false,
  });
});

test('browser-sensitive frontend paths select E2E without escalating every frontend edit', () => {
  assert.equal(classifyPaths(['frontend/components/card.tsx']).e2e, false);
  assert.equal(classifyPaths(['frontend/components/ui/button.tsx']).e2e, false);
  assert.equal(classifyPaths(['frontend/components/ui/command-palette.tsx']).e2e, true);
  assert.equal(classifyPaths(['frontend/components/ui/primitives.test.tsx']).e2e, false);
  assert.equal(classifyPaths(['frontend/lib/api/projects.ts']).e2e, false);
  assert.deepEqual(selectE2EFiles(['frontend/components/content/content-screen.tsx']), [
    'e2e/content.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/components/ui/button.tsx']), []);
  assert.deepEqual(selectE2EFiles(['frontend/components/ui/command-palette.tsx']), [
    'e2e/shell.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/e2e/billing.spec.ts']), ['e2e/billing.spec.ts']);
  assert.deepEqual(selectE2EFiles(['frontend/e2e/billing.spec.mjs']), []);
  assert.deepEqual(selectE2EFiles(['frontend/e2e/content-integration.spec.ts']), []);
  assert.equal(classifyPaths(['scripts/test.ps1', '.github/workflows/ci.yml']).e2e, false);
});

test('contracts and shared configuration invalidate both sides', () => {
  for (const path of [
    'backend/app/api/projects.py',
    'backend/app/main.py',
    'backend/app/domain/projects/schemas.py',
    'backend/app/domain/audits/schedule_schemas.py',
    'frontend/lib/api/projects.ts',
    'scripts/quality.mjs',
  ]) {
    const result = classifyPaths([path]);
    assert.equal(result.backend, true, path);
    assert.equal(result.frontend, true, path);
    assert.equal(result.contract, true, path);
  }
});

test('documentation-only changes avoid implementation suites', () => {
  assert.deepEqual(classifyPaths(['docs/DEVELOPMENT.md', 'README.md']), {
    backend: false,
    frontend: false,
    contract: false,
    e2e: false,
    security: false,
    compose: false,
  });
});

test('root governance and product prose avoid implementation suites', () => {
  assert.deepEqual(classifyPaths(['AGENTS.md', 'PRODUCT.md']), {
    backend: false,
    frontend: false,
    contract: false,
    e2e: false,
    security: false,
    compose: false,
  });
});

test('packaged Content skills remain backend production inputs', () => {
  assert.deepEqual(
    classifyPaths(['backend/app/core/config/content_skills/packs/blog/SKILL.md']),
    {
      backend: true,
      frontend: false,
      contract: false,
      e2e: false,
      security: false,
      compose: false,
    },
  );
});

test('Compose selects container-shaped changes only, on every push of a PR', () => {
  // Application code does not smoke the stack: the backend, frontend and E2E
  // owners already cover it. `{ initial: true }` is asserted alongside the plain
  // call because a PR's first push used to escalate to Compose on any changed
  // application file -- re-adding that option must not bring the escalation back.
  for (const path of ['backend/app/main.py', 'frontend/components/card.tsx', 'reset-db.py']) {
    assert.equal(classifyPaths([path], { initial: true }).compose, false, path);
    assert.equal(classifyPaths([path]).compose, false, path);
  }
  // The safety net: `main` pushes and merge-queue runs classify as full.
  assert.equal(classifyPaths([], { full: true }).compose, true);

  // What Compose is for: the images, the stack, the schema, and what gets
  // installed into a container. Every one of these must hold on EVERY push --
  // `frontend/Dockerfile` used to select Compose on the first push only.
  for (const path of [
    'Dockerfile',
    'frontend/Dockerfile',
    'docker-compose.yml',
    '.dockerignore',
    '.env.example',
    'migrations/versions/0001_initial.py',
    'backend/alembic.ini',
    'backend/pyproject.toml',
    'backend/uv.lock',
    'frontend/package.json',
    'frontend/pnpm-lock.yaml',
    'frontend/next.config.ts',
    '.github/workflows/compose-smoke.yml',
  ]) {
    assert.equal(classifyPaths([path]).compose, true, path);
  }
});

test('previous CI evidence requires a complete successful required aggregator', () => {
  const complete = [
    { name: 'Required', status: 'completed', conclusion: 'success' },
    ...[
      'Classify affected owners',
      'Backend (quality, pytest)',
      'Frontend (quality, coverage, build)',
      'API contract (backend to frontend)',
      'E2E (playwright)',
      'Security (pip-audit, detect-secrets)',
    ].map((name) => ({ name, status: 'completed', conclusion: 'skipped' })),
  ];
  assert.equal(hasTrustworthyJobEvidence(complete, 'ci.yml'), true);
  assert.equal(
    hasTrustworthyJobEvidence(
      complete.map((job) => (job.name === 'Required' ? { ...job, conclusion: 'failure' } : job)),
      'ci.yml',
    ),
    false,
  );
  assert.equal(hasTrustworthyJobEvidence(complete.slice(0, -1), 'ci.yml'), false);
  assert.equal(
    hasTrustworthyJobEvidence(
      [...complete, { name: 'Legacy permissive gate', status: 'completed', conclusion: 'success' }],
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
  for (const eventName of ['push', 'workflow_dispatch', 'merge_group']) {
    assert.deepEqual(selectDiff({ eventName }), { full: true, range: null }, eventName);
  }
});
