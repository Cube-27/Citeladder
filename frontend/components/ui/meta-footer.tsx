import type { ReactNode } from 'react';

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
