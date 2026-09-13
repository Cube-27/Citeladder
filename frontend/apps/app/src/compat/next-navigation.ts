import { useMemo } from 'react';
import {
  type NavigateFunction,
  useLocation,
  useNavigate,
  useParams as useReactRouterParams,
  useSearchParams as useReactRouterSearchParams,
} from 'react-router-dom';

import { viteOwnedDestination } from './route-ownership';

type NavigationOptions = {
  scroll?: boolean;
};

type AppRouter = {
  back(): void;
  forward(): void;
  prefetch(href: string): void;
  push(href: string, options?: NavigationOptions): void;
  refresh(): void;
  replace(href: string, options?: NavigationOptions): void;
};

function navigateOrHandoff(
  navigate: NavigateFunction,
  href: string,
  options: NavigationOptions | undefined,
  replace: boolean,
) {
  const destination = viteOwnedDestination(href);
  if (destination !== null) {
    navigate(destination, { preventScrollReset: options?.scroll === false, replace });
    return;
  }
  if (replace) {
    window.location.replace(href);
  } else {
    window.location.assign(href);
  }
}

/** Browser-router equivalent of Next's client navigation hooks used by the app. */
export function useRouter(): AppRouter {
  const navigate = useNavigate();

  return useMemo(
    () => ({
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      prefetch: (_href: string) => {},
      push: (href: string, options?: NavigationOptions) =>
        navigateOrHandoff(navigate, href, options, false),
      refresh: () => window.location.reload(),
      replace: (href: string, options?: NavigationOptions) =>
        navigateOrHandoff(navigate, href, options, true),
    }),
    [navigate],
  );
}

export function usePathname() {
  return useLocation().pathname;
}

/** Returns the current URL's query parameters, updated when React Router navigates. */
export function useSearchParams() {
  const [searchParams] = useReactRouterSearchParams();
  return searchParams;
}

/** Matches Next's typed dynamic-segment shape for the routes that consume it. */
export function useParams<T extends Record<string, string | string[]>>() {
  return useReactRouterParams() as T;
}
