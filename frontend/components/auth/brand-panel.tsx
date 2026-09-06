import Link from 'next/link';

import { LogoMark } from '@/components/ui/logo-mark';

/**
 * The wordmark in the auth/onboarding flow bar.
 *
 * The bar carries the MARKETING nav's rung exactly: the two bars are seen back
 * to back when a visitor clicks "Log in", and a logo that shrinks on the way
 * reads as a different, lesser page. There used to be a `compact` flag choosing
 * between two rungs, but the larger one never had a call site.
 */
export function AuthWordmark({ size }: Readonly<{ size?: number }>) {
  return (
    <Link
      href="/"
      aria-label="CiteLadder home"
      className="group inline-flex items-center no-underline transition-opacity hover:opacity-90"
    >
      <LogoMark size={size ?? 26} />
    </Link>
  );
}
