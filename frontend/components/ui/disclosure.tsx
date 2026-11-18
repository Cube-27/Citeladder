import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { textRole } from './typography';

/**
 * Native keyboard-accessible disclosure: the trigger tints on hover and its
 * chevron turns over when open; the panel eases open (ui-motion.css).
 */
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
      className="disclosure grid min-w-0 gap-3"
      onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
    >
      <summary
        className={textRole(
          'body',
          'text-ink-2 focus-ring hover:text-ink hover:overlay-hover flex min-h-[var(--target-min)] w-fit cursor-pointer items-center gap-2 rounded-control px-2 transition-colors duration-[var(--motion-tint)] [&::-webkit-details-marker]:hidden',
        )}
      >
        {title}
        <ChevronDown
          className="size-4 shrink-0 transition-[rotate] duration-[var(--motion-overlay)]"
          aria-hidden
        />
      </summary>
      <div className="grid min-w-0 gap-3 pt-3">{children}</div>
    </details>
  );
}
