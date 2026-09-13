const VITE_ROUTES: Record<string, true> = {
  '/ai-referrals': true,
  '/content': true,
  '/demand': true,
  '/issues': true,
  '/login': true,
  '/onboarding': true,
  '/opportunities': true,
  '/performance': true,
  '/projects': true,
  '/products': true,
  '/prompts': true,
  '/register': true,
  '/runs': true,
  '/site': true,
  '/visibility': true,
};

/**
 * Resolve a destination only when the current Vite route tree owns it.
 * Returning null deliberately hands the navigation to the production ingress,
 * which keeps not-yet-migrated application and marketing paths on Next.
 */
export function viteOwnedDestination(
  href: string,
  currentHref = window.location.href,
): string | null {
  const current = new URL(currentHref);
  const destination = new URL(href, current);
  const viteOwnsPath =
    VITE_ROUTES[destination.pathname] === true ||
    /^\/runs\/[^/]+$/.test(destination.pathname) ||
    /^\/site\/crawls\/[^/]+\/pages\/[^/]+$/.test(destination.pathname);
  if (destination.origin !== current.origin || !viteOwnsPath) return null;
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
