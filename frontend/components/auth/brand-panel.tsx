import Link from 'next/link';

import { LogoMark } from '@/components/ui/logo-mark';

/**
 * The wordmark in the auth/onboarding flow bar.
 *
 * `compact` matches the MARKETING nav's 24px lockup rather than sitting a
 * couple of pixels under it — the two bars are seen back to back when a
 * visitor clicks "Log in", and a logo that shrinks on the way reads as a
 * different, lesser page.
 */
export function AuthWordmark({
  compact = false,
  size,
}: Readonly<{ compact?: boolean; size?: number }>) {
  return (
    <Link
      href="/"
      aria-label="CiteLadder home"
      className="group inline-flex items-center no-underline transition-opacity hover:opacity-90"
    >
      <LogoMark size={size ?? (compact ? 24 : 28)} />
    </Link>
  );
}
