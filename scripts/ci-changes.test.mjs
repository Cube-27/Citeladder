import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyPaths,
  hasTrustworthyJobEvidence,
  isOwnerFreeChange,
  selectE2EFiles,
  selectDiff,
} from './ci-changes.mjs';

test('backend and frontend paths select only their owning suites', () => {
  assert.deepEqual(classifyPaths(['backend/app/analysis/costs.py']), {
    backend: true,
    frontend: false,
    contract: false,
    api: false,
    e2e: false,
    security: false,
    compose: false,
  });
  assert.deepEqual(classifyPaths(['frontend/components/card.tsx']), {
    backend: false,
    frontend: true,
    contract: false,
    api: false,
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
  assert.deepEqual(selectE2EFiles(['frontend/components/opportunities/evidence-drawer.tsx']), [
    'e2e/action-loop.spec.ts',
  ]);
  assert.deepEqual(
    selectE2EFiles([
      'frontend/components/agent/chat-screen.tsx',
      'frontend/lib/agent/next-steps.ts',
    ]),
    ['e2e/action-loop.spec.ts', 'e2e/agent-conversation.spec.ts'],
  );
  assert.deepEqual(selectE2EFiles(['frontend/components/ui/button.tsx']), []);
  assert.deepEqual(selectE2EFiles(['frontend/components/ui/command-palette.tsx']), [
    'e2e/shell.spec.ts',
  ]);
  assert.deepEqual(selectE2EFiles(['frontend/e2e/billing.spec.ts']), ['e2e/billing.spec.ts']);
  assert.deepEqual(selectE2EFiles(['frontend/e2e/billing.spec.mjs']), []);
  assert.equal(classifyPaths(['scripts/check.ps1', '.github/workflows/ci.yml']).e2e, false);
});

test('contracts and shared configuration invalidate both sides', () => {
  for (const path of [
    'frontend/services/api/src/routes/projects.ts',
    'frontend/services/api/src/openapi/routes.ts',
    'frontend/lib/api/projects.ts',
    'frontend/packages/contracts/src/project.ts',
    'scripts/quality.mjs',
  ]) {
    const result = classifyPaths([path]);
    assert.equal(result.backend, true, path);
    assert.equal(result.frontend, true, path);
    assert.equal(result.contract, true, path);
  }
});

test('the native API runs for its code and canonical schema inputs', () => {
  for (const path of [
    'frontend/services/api/src/app.ts',
    'frontend/services/api/assets/agent-skills/skills/gsc_optimize/SKILL.md',
    'frontend/pnpm-lock.yaml',
    'migrations/versions/0001_initial.py',
    'backend/app/core/migration_config.py',
    'backend/app/models/integrations.py',
    'frontend/packages/contracts/src/route-ownership.ts',
    'frontend/services/api/src/routes/projects.ts',
  ]) {
    assert.equal(classifyPaths([path]).api, true, path);
  }
  for (const path of [
    'backend/app/analysis/costs.py',
    'backend/scripts/seed_dev_data.py',
    'backend/scripts/check_test_shape.py',
    'backend/app/domain/workspaces/policy.py',
    'frontend/components/card.tsx',
  ]) {
    assert.equal(classifyPaths([path]).api, false, path);
  }
  assert.equal(classifyPaths(['frontend/services/api/src/server.ts']).compose, true);
});

test('documentation-only changes avoid implementation suites', () => {
  assert.deepEqual(classifyPaths(['docs/DEVELOPMENT.md', 'README.md']), {
    backend: false,
    frontend: false,
    contract: false,
    api: false,
    e2e: false,
    security: false,
    compose: false,
  });
});

test('external-service and deploy-only configuration runs only the security owner', () => {
  assert.deepEqual(
    classifyPaths(['.sonarcloud.properties', '.github/workflows/gcp-deploy.yml', 'docs/x.md']),
    {
      backend: false,
      frontend: false,
      contract: false,
      api: false,
      e2e: false,
      security: true,
      compose: false,
    },
  );
  // The CI workflow itself still escalates: owners run under its definition.
  assert.equal(classifyPaths(['.github/workflows/ci.yml']).backend, true);
});

test('main skips full validation only for an owner-free push', () => {
  assert.equal(isOwnerFreeChange(['docs/README.md', '.sonarcloud.properties']), true);
  assert.equal(isOwnerFreeChange(['docs/README.md', 'backend/app/main.py']), false);
  // An unknown range must never read as an owner-free change.
  assert.equal(isOwnerFreeChange([]), false);
});

test('root governance and product prose avoid implementation suites', () => {
  assert.deepEqual(classifyPaths(['AGENTS.md', 'PRODUCT.md']), {
    backend: false,
    frontend: false,
    contract: false,
    api: false,
    e2e: false,
    security: false,
    compose: false,
  });
});

test('packaged Agent skills select their native API and image owners', () => {
  assert.deepEqual(
    classifyPaths(['frontend/services/api/assets/agent-skills/skills/gsc_optimize/SKILL.md']),
    {
      backend: false,
      frontend: true,
      contract: false,
      api: true,
      e2e: false,
      security: false,
      compose: true,
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
    'frontend/apps/app/vite.config.ts',
    'frontend/apps/marketing/astro.config.mjs',
    'frontend/apps/docs/astro.config.mjs',
    'frontend/lib/server/worker-origin-proxy.ts',
    'scripts/frontend-ingress-smoke.mjs',
    'scripts/bootstrap-environment.sh',
    '.github/workflows/compose-smoke.yml',
  ]) {
    assert.equal(classifyPaths([path]).compose, true, path);
  }
});

test('previous CI evidence requires every owner to be successful or intentionally skipped', () => {
  const complete = [
    { name: 'Classify affected owners', status: 'completed', conclusion: 'success' },
    ...[
      'Backend (quality, pytest)',
      'Frontend (quality, coverage, build)',
      'API contract (backend to frontend)',
      'API service (TypeScript)',
      'E2E (playwright)',
      'Security (pip-audit, detect-secrets)',
    ].map((name) => ({ name, status: 'completed', conclusion: 'skipped' })),
  ];
  assert.equal(hasTrustworthyJobEvidence(complete, 'ci.yml'), true);
  assert.equal(
    hasTrustworthyJobEvidence(
      complete.map((job) =>
        job.name === 'Frontend (quality, coverage, build)'
          ? { ...job, conclusion: 'failure' }
          : job,
      ),
      'ci.yml',
    ),
    false,
  );
  assert.equal(hasTrustworthyJobEvidence(complete.slice(0, -1), 'ci.yml'), false);
  assert.equal(
    hasTrustworthyJobEvidence(
      [...complete, { name: 'Legacy aggregate gate', status: 'completed', conclusion: 'success' }],
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
  // A force-pushed main has no meaningful push range.
  assert.deepEqual(
    selectDiff({
      eventName: 'push',
      beforeSha: 'before',
      headSha: 'head',
      beforeIsAncestor: false,
    }),
    { full: true, range: null },
  );
});
