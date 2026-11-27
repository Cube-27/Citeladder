import { cn } from '@/lib/utils';

export function wellClasses(className?: string) {
  return cn('surface-well bg-well rounded-control p-card', className);
}

export const SHEET_FACE =
  'bg-panel text-ink border-transparent rounded-overlay border shadow-sheet';

export const POP_FACE =
  'bg-raised app:bg-panel text-ink border-transparent rounded-card border shadow-pop';
