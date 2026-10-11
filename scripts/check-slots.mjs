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
import { setTimeout as sleep } from 'node:timers/promises';
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

/** Claims `path` for this process; false while a live process holds it. */
function claim(path) {
  for (;;) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      process.on('exit', () => {
        try {
          unlinkSync(path);
        } catch {
          // Already reclaimed.
        }
      });
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    let owner, pending;
    try {
      owner = Number(readFileSync(path, 'utf8'));
      // An empty file is a claim still being written, unless it was abandoned long ago.
      pending = !owner && Date.now() - statSync(path).mtimeMs < 60_000;
    } catch (error) {
      if (error.code === 'ENOENT') continue; // Released meanwhile; claim it.
      throw error;
    }
    if (pending || (owner && alive(owner))) return false;
    try {
      unlinkSync(path);
    } catch {
      // Another process reclaimed it first; try again.
    }
  }
}

/** One check per worktree: a second one fails at once rather than queueing. */
export function claimWorktree(gitDirectory) {
  if (!claim(join(gitDirectory, 'citeladder-check.lock')))
    throw new Error('A check is already running in this worktree. Wait for it to finish.');
}

/** Waits for one of the machine's heavy-check slots (CITELADDER_HEAVY_CHECKS, default 2). */
export async function claimMachineSlot() {
  const directory = join(tmpdir(), 'citeladder-heavy-checks');
  mkdirSync(directory, { recursive: true });
  for (let announced = false; ; announced = true) {
    for (let slot = 0; slot < MACHINE_SLOTS; slot += 1)
      if (claim(join(directory, `slot-${slot}`))) return;
    if (!announced)
      process.stdout.write(`Waiting for one of ${MACHINE_SLOTS} machine check slots…\n`);
    await sleep(WAIT_MS);
  }
}
