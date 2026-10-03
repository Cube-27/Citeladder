import { z } from 'zod';

export const CONTACT_EMAIL = 'contact@citeladder.com';
const CONTACT_PATH = '/contact';
export const CONTACT_API_PATH = '/api/v1/contact';
export const CONTACT_SENDER = 'CiteLadder Website <notifications@citeladder.com>';
export const CONTACT_MAX_BODY_BYTES = 32_768;
export const CONTACT_REQUEST_TIMEOUT_MS = 15_000;
export const CONTACT_SEND_TIMEOUT_MS = 10_000;
export const CONTACT_LIMITS = {
  name: 100,
  email: 254,
  company: 200,
  messageMin: 10,
  message: 5_000,
};

const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^\r\n]*$/);
export const contactSubmissionSchema = z.strictObject({
  name: singleLine(CONTACT_LIMITS.name).min(1, 'Enter your name.'),
  email: singleLine(CONTACT_LIMITS.email)
    .toLowerCase()
    .pipe(z.email('Enter a valid email address.')),
  company: singleLine(CONTACT_LIMITS.company).optional().default(''),
  message: z
    .string()
    .trim()
    .min(CONTACT_LIMITS.messageMin, 'Please write at least 10 characters.')
    .max(CONTACT_LIMITS.message),
  website: z.string().max(CONTACT_LIMITS.company).optional().default(''),
});
export type ContactSubmission = z.infer<typeof contactSubmissionSchema>;

/** Retained published catalogs can still carry the former CiteLadder intake URL. */
export function contactSalesHref(href: string | null | undefined, fallback = CONTACT_PATH): string {
  if (!href) return fallback;
  try {
    const url = new URL(href);
    if (
      ['cube27.com', 'www.cube27.com'].includes(url.hostname) &&
      /^\/contact\/?$/.test(url.pathname)
    )
      return fallback;
  } catch {
    // Other catalog destinations retain their existing meaning.
  }
  return href;
}
