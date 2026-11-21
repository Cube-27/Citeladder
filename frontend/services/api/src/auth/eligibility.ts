export function requiresEmailVerification(user: {
  registration_origin: string;
  email_verified_at: Date | null;
}): boolean {
  if (user.registration_origin === 'public') return user.email_verified_at === null;
  return user.registration_origin !== 'operator';
}
