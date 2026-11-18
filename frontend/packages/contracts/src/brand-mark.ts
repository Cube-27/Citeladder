import { z } from 'zod';

// The cached logo and stored site behind a named brand or competitor, from the
// project's brand and competitor records; both null for a name with no record.
export const brandMarkFields = {
  logo_url: z.string().nullable(),
  website_url: z.string().nullable(),
};
