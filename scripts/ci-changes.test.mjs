import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyFailedOwners,
  classifyPaths,
  failedJobOwners,
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
    e2e: true,
    security: false,
    compose: false,
  });
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

test('initial PRs smoke changed application areas but later pushes do not', () => {
  assert.equal(classifyPaths(['backend/app/main.py'], { initial: true }).compose, true);
  assert.equal(classifyPaths(['backend/app/main.py']).compose, false);
  assert.equal(classifyPaths(['Dockerfile']).compose, true);
});

test('failed owners from the previous head are selected again', () => {
  const owners = failedJobOwners(
    [
      { name: 'Backend (quality, pytest)', conclusion: 'failure' },
      { name: 'Frontend (quality, coverage, build)', conclusion: 'success' },
    ],
    'ci.yml',
  );
  assert.deepEqual([...owners], ['backend']);

  const result = classifyPaths(['frontend/components/card.tsx']);
  applyFailedOwners(result, owners);
  assert.equal(result.backend, true);
  assert.equal(result.frontend, true);
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
    { full: false, initial: false, range: 'before..head' },
  );
  assert.deepEqual(selectDiff({ eventName: 'push' }), {
    full: true,
    initial: false,
    range: null,
  });
  assert.deepEqual(selectDiff({ eventName: 'workflow_dispatch' }), {
    full: true,
    initial: false,
    range: null,
  });
  assert.deepEqual(selectDiff({ eventName: 'merge_group' }), {
    full: true,
    initial: false,
    range: null,
  });
});
