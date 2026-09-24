import { LogoMark, type BrandLogoVariant } from '@/components/ui/logo-mark';
import { websiteHref } from '@/lib/config/app-link';

/**
 * The wordmark in the auth/onboarding flow bar.
 *
 * The bar carries the MARKETING nav's canonical brand rung identically:
 * both bars share the same source of truth in LogoMark, ensuring complete
 * symmetry when navigating between marketing, auth, and onboarding flows.
 */
export function AuthWordmark({
  size,
  variant,
  priority = true,
}: Readonly<{
  size?: number;
  variant?: BrandLogoVariant;
  priority?: boolean;
}>) {
  return (
    // The public home lives on the website origin; "/" on the app origin is
    // the product root, which a signed-out visitor cannot use.
    <a
      href={websiteHref('/')}
      aria-label="CiteLadder home"
      className="group inline-flex items-center no-underline transition-opacity hover:opacity-90"
    >
      <LogoMark size={size} variant={variant} priority={priority} />
    </a>
  );
}
