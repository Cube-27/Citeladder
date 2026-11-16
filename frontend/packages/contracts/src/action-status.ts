import { z } from 'zod';

// New (`open`) → In progress (Accept, or Work with Agent) → Done (Mark
// implemented); Declined (`dismissed`) from New or In progress, back to New
// (Restore) or In progress (Accept). Done is final for the user.
export const actionStatusSchema = z.enum(['open', 'in_progress', 'done', 'dismissed']);
export type ActionStatus = z.infer<typeof actionStatusSchema>;

// A Done Action's measurement underneath its status: measuring until every
// expected check verified, then verified. Null before Done.
export const actionMeasurementSchema = z.enum(['measuring', 'verified']);
export type ActionMeasurement = z.infer<typeof actionMeasurementSchema>;

/** The Actions list's status filter value that keeps every status. */
export const ACTION_STATUS_ANY = 'any';
