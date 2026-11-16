/** Request bodies of the Action routes; shapes and responses are the shared contracts. */
import {
  actionStatusUpdateRequestSchema,
  actionUserStatusSchema,
} from '@citeladder/contracts/actions';
import { z } from 'zod';

/** The statuses a user decision stores: Accept, Decline and Restore. */
export const statusPatch = actionStatusUpdateRequestSchema.extend({
  status: z
    .string()
    .refine(
      (value) => actionUserStatusSchema.safeParse(value).success,
      'Status must be in_progress, dismissed or open',
    )
    .pipe(actionUserStatusSchema),
});
