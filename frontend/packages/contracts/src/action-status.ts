import { z } from 'zod';

// open → in progress → implemented (declared) → measuring → done | dismissed.
// A user stores `open` or `dismissed` and a declaration stores `implemented`;
// `in_progress`, `measuring` and `done` are derived by the server.
export const actionStatusSchema = z.enum([
  'open',
  'in_progress',
  'implemented',
  'measuring',
  'done',
  'dismissed',
]);

/** The Actions list's status filter value that keeps every status. */
export const ACTION_STATUS_ANY = 'any';
