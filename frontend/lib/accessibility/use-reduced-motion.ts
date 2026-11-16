import { useMediaQuery } from '@/lib/use-media-query';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Browser-owned reduced-motion preference without an animation runtime. */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}
