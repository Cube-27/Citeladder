import { useMediaQuery } from '@/lib/use-media-query';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function scrollBehavior(): ScrollBehavior {
  return globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth';
}

export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}
