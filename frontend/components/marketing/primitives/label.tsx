import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The "meta" role: small (12/16), semibold labels with tabular numerals
 * (`font-mono tabular-nums`) — the same numeric recipe every figure in the
 * app renders with, so numbers align and read as data. The default ink is
 * `text-mkt-ink-soft` (paper/surface-only — on sunken/wash bands callers
 * pass `text-mkt-ink-soft`); kickers layer `uppercase` on top. Codifying
 * the recipe as one component is why every label on the surface matches.
 */
export function Meta({
  children,
  className,
  as: Tag = 'span',
}: Readonly<{ children: ReactNode; className?: string; as?: 'span' | 'p' | 'div' }>) {
  return (
    <Tag
      className={cn(
        'text-mkt-xs text-mkt-ink-soft font-mono font-semibold tabular-nums',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * The eyebrow / pre-title (docs/website-design-system.md §5.5): Text XS Bold
 * in slate, optionally led by a 6px accent dot at a 10px gap. It sits 10–20px
 * above the heading, which is the SectionHeader gap — never spaced by the call
 * site. The dot is the only decorative use of the accent on paper; everywhere
 * else colour has to mean a state.
 *
 * ONE definition, here. `section.tsx` shipped a second component of the same
 * name at a different rung, gap and dot treatment — the exact token drift this
 * primitive layer exists to remove — so `SectionHeader` now renders this one.
 */
export function Eyebrow({
  children,
  dot = true,
  className,
}: Readonly<{ children: ReactNode; dot?: boolean; className?: string }>) {
  return (
    <p className={cn('gap-mkt-10 text-mkt-xsb text-mkt-ink-soft flex items-center', className)}>
      {dot && <span aria-hidden className="bg-mkt-indigo size-mkt-6 shrink-0 rounded-full" />}
      {children}
    </p>
  );
}
