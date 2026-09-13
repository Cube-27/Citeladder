const VITE_ROUTES: Record<string, true> = {
  '/login': true,
  '/onboarding': true,
  '/projects': true,
  '/register': true,
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
  if (destination.origin !== current.origin || VITE_ROUTES[destination.pathname] !== true)
    return null;
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
