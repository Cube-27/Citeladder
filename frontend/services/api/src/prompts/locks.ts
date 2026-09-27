/**
 * The project advisory lock shared with the Python prompt writers
 * (`app/domain/prompts/locks.py`).
 *
 * Transaction-scoped, so it releases at COMMIT/ROLLBACK. The key derivation
 * (a personalized 8-byte BLAKE2b of the namespace and the UUID bytes, read
 * as a signed big-endian integer) is proved against Python by a live golden,
 * so both stacks serialize on one key.
 */
import { blake2b } from '@noble/hashes/blake2.js';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';

const { namespace, person } = policy.opportunity.refresh.project_lock;

function uuidBytes(id: string): Uint8Array {
  const hex = id.replaceAll('-', '');
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

/** The signed 64-bit lock key for one project. */
export function projectLockKey(projectId: string): bigint {
  const input = new Uint8Array(20);
  new DataView(input.buffer).setUint32(0, namespace);
  input.set(uuidBytes(projectId), 4);
  const digest = blake2b(input, { dkLen: 8, personalization: new TextEncoder().encode(person) });
  return new DataView(digest.buffer, digest.byteOffset, 8).getBigInt64(0);
}

/** Serialize this project's topic-level and Opportunity writers. */
export async function acquireProjectLock(db: Database, projectId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(${projectLockKey(projectId).toString()}::bigint)`.execute(
    db,
  );
}
