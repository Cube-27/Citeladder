/** Legacy/operator access is explicit policy, never invented mailbox proof. */
export function requiresEmailVerification(user: {
  registration_origin: string;
  email_verified_at: Date | null;
}): boolean {
  return user.registration_origin === 'public' && user.email_verified_at === null;
}
