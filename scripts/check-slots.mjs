/**
 * Concurrency limits for heavy local checks. Several agent sessions share one
 * machine; each check starts tsc, vitest and builds, and running many at once is
 * what makes them time out. A slot is a file holding its owner's pid, freed on
 * exit; a slot whose pid is gone is reclaimed.
 */
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MACHINE_SLOTS = Number(process.env.CITELADDER_HEAVY_CHECKS) || 2;
const WAIT_MS = 5000;

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

const removeQuietly = (path) => {
  try {
    unlinkSync(path);
  } catch {
    // Already gone.
  }
};

/** Creates `path` holding this pid, removed on exit; false when it already exists. */
function create(path) {
  try {
    const fd = openSync(path, 'wx');
    writeSync(fd, String(process.pid));
    closeSync(fd);
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
  process.on('exit', () => removeQuietly(path));
  return true;
}

/** Whether an existing slot file still belongs to a live claim. */
function held(path) {
  try {
    const owner = Number(readFileSync(path, 'utf8'));
    // An empty file is a claim still being written, unless it was abandoned long ago.
    if (!owner) return Date.now() - statSync(path).mtimeMs < 60_000;
    return alive(owner);
  } catch (error) {
    if (error.code === 'ENOENT') return false; // Released meanwhile.
    throw error;
  }
}

/** Claims `path` for this process; false while a live process holds it. */
function claim(path) {
  for (;;) {
    if (create(path)) return true;
    if (held(path)) return false;
    removeQuietly(path); // Its owner is gone; reclaim it.
  }
}

/** One check per worktree: a second one fails at once rather than queueing. */
export function claimWorktree(gitDirectory) {
  if (!claim(join(gitDirectory, 'citeladder-check.lock')))
    throw new Error('A check is already running in this worktree. Wait for it to finish.');
}

/** Waits for one of the machine's heavy-check slots (CITELADDER_HEAVY_CHECKS, default 2). */
export function claimMachineSlot() {
  const directory = join(tmpdir(), 'citeladder-heavy-checks');
  mkdirSync(directory, { recursive: true });
  const claimAny = () =>
    Array.from({ length: MACHINE_SLOTS }, (_, slot) => join(directory, `slot-${slot}`)).some(claim);
  if (claimAny()) return Promise.resolve();
  process.stdout.write(`Waiting for one of ${MACHINE_SLOTS} machine check slots…\n`);
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (!claimAny()) return;
      clearInterval(timer);
      resolve();
    }, WAIT_MS);
  });
}
