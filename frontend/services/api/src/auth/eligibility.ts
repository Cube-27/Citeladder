/**
 * Public signups prove their mailbox; operator-created identities are trusted
 * by explicit policy, never by invented mailbox proof. Any other origin fails closed.
 */
export function requiresEmailVerification(user: {
  registration_origin: string;
  email_verified_at: Date | null;
}): boolean {
  if (user.registration_origin === 'public') return user.email_verified_at === null;
  return user.registration_origin !== 'operator';
}
