/** Legacy/operator access is explicit policy, never invented mailbox proof. */
export function requiresEmailVerification(user: {
  registration_origin: string;
  email_verified_at: Date | null;
}): boolean {
  if (user.registration_origin === 'public') return user.email_verified_at === null;
  return !['legacy', 'operator'].includes(user.registration_origin);
}
