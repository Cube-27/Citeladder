import type { ElementType, ReactNode } from 'react';

export function PaneBlock({
  as: Component = 'div',
  'aria-label': label,
  children,
}: Readonly<{ as?: ElementType; 'aria-label'?: string; children: ReactNode }>) {
  return (
    <Component aria-label={label} className="border-rule p-card gap-compact grid border-b">
      {children}
    </Component>
  );
}
