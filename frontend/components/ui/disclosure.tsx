import type { ReactNode } from 'react';
import { textRole } from './typography';

/** Native keyboard-accessible disclosure with the shared focus and text treatment. */
export function Disclosure({
  title,
  children,
  onOpenChange,
}: Readonly<{
  title: ReactNode;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}>) {
  return (
    <details
      className="grid min-w-0 gap-3"
      onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
    >
      <summary
        className={textRole(
          'body',
          'text-ink-2 focus-ring hover:text-ink w-fit cursor-pointer rounded-control',
        )}
      >
        {title}
      </summary>
      <div className="grid min-w-0 gap-3 pt-3">{children}</div>
    </details>
  );
}
