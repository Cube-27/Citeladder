import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { POP_FACE } from '@/components/ui/slip';

export function treeBranchClasses(className?: string) {
  return cn('border-rule grid min-w-0 gap-2 border-l pl-4', className);
}

export function MetaFooter({
  children,
  trailing,
}: Readonly<{ children: ReactNode; trailing?: ReactNode }>) {
  if (!trailing)
    return (
      <footer className="text-caption text-ink-2 border-rule flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3">
        {children}
      </footer>
    );
  return (
    <footer className="text-caption text-ink-2 border-rule flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">{children}</div>
      {trailing}
    </footer>
  );
}

export function FloatingToolbar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={cn(POP_FACE, 'absolute end-3 top-3 z-raised flex gap-1 p-1')}>{children}</div>
  );
}
