/**
 * Whether anyone may create their own account: the sign-up form, "Start free
 * trial" and "Continue with Google" (a first Google sign-in creates an
 * account). Off unless the build sets it; operators create client logins
 * meanwhile. The API enforces the same rule through `PUBLIC_SIGNUP_ENABLED`.
 */
export function selfServeSignupOpen(): boolean {
  return process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP === 'true';
}
