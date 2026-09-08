import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The "meta" role: small (12/16), semibold labels with tabular numerals
 * (`font-mono tabular-nums`) — the same numeric recipe every figure in the
 * app renders with, so numbers align and read as data. The default ink is
 * `text-muted` (paper/surface-only — on sunken/wash bands callers
 * pass `text-muted`); kickers use the same sentence-case role. Codifying
 * the recipe as one component is why every label on the surface matches.
 */
export function Meta({
  children,
  className,
  as: Tag = 'span',
}: Readonly<{ children: ReactNode; className?: string; as?: 'span' | 'p' | 'div' }>) {
  return <Tag className={cn('website-label text-muted tabular-nums', className)}>{children}</Tag>;
}

/**
 * The eyebrow / pre-title (docs/design.md §Marketing): a small, quiet label a
 * half-step above the heading. No accent dot — the canvas system's accent is
 * reserved for actions and evidence, and a decorative marker before every
 * label is exactly the templated rhythm this primitive layer exists to
 * prevent. It sits 10–20px above the heading, which is the SectionHeader
 * gap — never spaced by the call site.
 *
 * ONE definition, here. `section.tsx` shipped a second component of the same
 * name at a different rung, gap and dot treatment — the exact token drift this
 * primitive layer exists to remove — so `SectionHeader` now renders this one.
 */
export function Eyebrow({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={cn('website-eyebrow text-muted inline-flex items-center', className)}>
      <span>{children}</span>
    </div>
  );
}
