/**
 * Request bodies and server-only responses of the `opportunities` family.
 * Responses the browser reads are the shared `@citeladder/contracts` schemas.
 */
import { opportunityOrderUpdateRequestSchema } from '@citeladder/contracts/opportunities';
import { z } from 'zod';

export const orderUpdate = opportunityOrderUpdateRequestSchema;

/** A file download publishes no JSON schema. */
export const fileResponse = z.unknown();
