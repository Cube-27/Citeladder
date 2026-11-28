import { ChevronDown } from '@/lib/icons';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import './disclosure.css';

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
      <summary className="text-body text-ink-2 focus-ring hover:text-ink min-h-target rounded-control duration-fast flex w-fit cursor-pointer items-center gap-2 transition-colors [&::-webkit-details-marker]:hidden">
        {title}
        <Icon icon={ChevronDown} size="flush" />
      </summary>
      <div className="grid min-w-0 gap-3 pt-3">{children}</div>
    </details>
  );
}
