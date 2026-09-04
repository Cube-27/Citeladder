/**
 * Client-side auth form schemas (F4).
 *
 * These validate the login/register forms in the browser (react-hook-form +
 * zod) BEFORE a request is made. They are intentionally separate from the API
 * contract schemas in `lib/api/schemas.ts` (which validate backend responses):
 * these describe form *input*, the API schemas describe server *output*.
 */
import { z } from 'zod';

/** Shared email + password rules reused by both forms. */
const email = z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.');
const password = z.string().min(8, 'Password must be at least 8 characters.');

export const loginFormSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required.'),
});

export const registerFormSchema = z
  .object({
    email,
    password,
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type RegisterFormValues = z.infer<typeof registerFormSchema>;

/**
 * Best-effort human message from a thrown mutation error. The transport already
 * unwraps a JSON `{ detail }` body into `ApiError.message`, so we surface that
 * directly and fall back to a generic message for anything else.
 */
export function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Something went wrong. Please try again.';
}

/**
 * Messages for the coded `?error=` the Google sign-in callback redirects with.
 *
 * The callback is a full-page navigation, so it cannot return a JSON error
 * body — it carries a machine-readable code on the login URL instead. Codes
 * are owned by `backend/app/core/config/oauth.py`. An unrecognized code still
 * gets a message rather than a silent, unexplained bounce back to /login.
 */
const OAUTH_SIGNIN_ERRORS: Record<string, string> = {
  oauth_signin_state_invalid: 'That sign-in link expired or was already used. Please try again.',
  oauth_signin_email_unverified:
    'Google has not verified that email address, so it cannot be linked to an account.',
  oauth_signin_disabled: 'Google sign-in is unavailable right now. Please use email below.',
  oauth_signin_failed: 'Google sign-in did not complete. Please try again.',
};

export function oauthSignInErrorMessage(code: string | null): string | undefined {
  if (!code) return undefined;
  return OAUTH_SIGNIN_ERRORS[code] ?? 'Google sign-in did not complete. Please try again.';
}
