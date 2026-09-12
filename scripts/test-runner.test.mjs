import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';

const runnerEnv = { ...process.env };
delete runnerEnv.NODE_TEST_CONTEXT;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'citeladder-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(new URL('./test.ps1', import.meta.url), join(root, 'scripts/test.ps1'));
  writeFileSync(join(root, 'scripts/validation.json'), JSON.stringify({
    backendRoots: [], frontendRoots: [], backendExtensions: ['.py'],
    frontendExtensions: ['.ts'], rules: [],
  }));
  for (const args of [
    ['init', '-q'], ['config', 'user.email', 'runner@example.test'],
    ['config', 'user.name', 'Runner fixture'], ['add', '.'], ['commit', '-qm', 'fixture'],
    ['update-ref', 'refs/remotes/origin/main', 'HEAD'],
  ]) {
    assert.equal(spawnSync('git', args, { cwd: root, encoding: 'utf8' }).status, 0);
  }
  return root;
}

function run(root, ...args) {
  return spawnSync('pwsh', ['-NoProfile', '-File', 'scripts/test.ps1', ...args], {
    cwd: root, env: runnerEnv, encoding: 'utf8', timeout: 30000,
  });
}

function sample(root, { fails = false, delay = 0 } = {}) {
  writeFileSync(join(root, 'scripts/sample.test.mjs'), `
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
test('fixture behaviour', async () => {
  appendFileSync('executions', 'x');
  await new Promise(resolve => setTimeout(resolve, ${delay}));
  assert.equal(${fails}, false);
});
`);
}

test('minor and plan-only changes run nothing; successful evidence is reused after a commit', (t) => {
  const root = fixture(t);
  sample(root);
  assert.equal(run(root, '-Risk', 'Minor').status, 0);
  assert.equal(run(root, '-PlanOnly').status, 0);
  assert.equal(existsSync(join(root, 'executions')), false);
  const first = run(root, '-ChangedFiles', 'scripts/sample.test.mjs');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  spawnSync('git', ['add', 'scripts/sample.test.mjs'], { cwd: root });
  spawnSync('git', ['commit', '-qm', 'feature'], { cwd: root });
  const again = run(root, '-ChangedFiles', 'scripts/sample.test.mjs');
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.equal(readFileSync(join(root, 'executions'), 'utf8'), 'x');
});

test('a failed selection is retried after a repair without broadening the task', (t) => {
  const root = fixture(t);
  sample(root, { fails: true });
  assert.notEqual(run(root, '-ChangedFiles', 'scripts/sample.test.mjs').status, 0);
  sample(root);
  const repaired = run(root, '-ChangedFiles', 'scripts/sample.test.mjs');
  assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
  assert.equal(readFileSync(join(root, 'executions'), 'utf8'), 'xx');
});

test('a second runner cannot overwrite the active run record', async (t) => {
  const root = fixture(t);
  sample(root, { delay: 2500 });
  const child = spawn('pwsh', ['-NoProfile', '-File', 'scripts/test.ps1'], { cwd: root, env: runnerEnv });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const done = new Promise((resolve) => child.on('exit', resolve));
  try {
    for (let attempt = 0; attempt < 200 && !existsSync(join(root, 'executions')); attempt++) {
      await setTimeout(20);
    }
    assert.equal(existsSync(join(root, 'executions')), true, output);
    const statePath = join(root, '.git/citeladder-test-state.json');
    const before = readFileSync(statePath, 'utf8');
    const overlapping = run(root);
    assert.notEqual(overlapping.status, 0);
    assert.match(overlapping.stderr, /already active/);
    assert.equal(readFileSync(statePath, 'utf8'), before);
    assert.equal(await done, 0, output);
  } finally {
    if (child.exitCode === null) child.kill();
    await done;
  }
});
