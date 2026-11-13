import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Shimmer — words that say work is under way, with a lighter band passing
 * over them (the AI Elements Shimmer pattern). Text only; a loading block is a
 * `Skeleton`.
 */
export function Shimmer({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return <span className={cn('text-shimmer', className)}>{children}</span>;
}
