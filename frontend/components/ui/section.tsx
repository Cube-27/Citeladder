import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { StateHeadingLevelContext } from '@/components/ui/state-block';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * Section — the default grouping on every page (law 5:
 * rules, not boxes). No box: a 1px ink rule on top, 12 to the head, 16 to
 * the body on the page ground. It owns the rhythm above it: when it is not
 * first in its container it sits 32 below the block above (globals.css,
 * `surface-section`), so a page sets no vertical gap. A section may hold
 * slips and wells, never another section's box. It sets no display of its
 * own, so a sticky child keeps its scroll container.
 */
export function Section({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'section'>>) {
  return (
    <section
      {...props}
      className={cn('surface-section border-rule-ink min-w-0 border-t pt-3', className)}
    >
      {/* Under the section's h2 title, a block state's heading is an h3. */}
      <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
    </section>
  );
}

/**
 * SectionHeader — the overline, title and caption on the left and `actions`
 * (a secondary or quiet Button, a small control group) at the right of the
 * same row; when the row is narrow the actions wrap below the title. The body
 * starts 16 below it.
 */
export function SectionHeader({
  children,
  className,
  actions,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'header'> & {
    /** Trailing controls or status on the title row; wraps below when narrow. */
    actions?: ReactNode;
  }
>) {
  if (!actions) {
    return (
      <header {...props} className={cn('flex flex-col gap-1 not-last:mb-4', className)}>
        {children}
      </header>
    );
  }
  return (
    <header
      {...props}
      className={cn('flex flex-wrap items-start justify-between gap-2 not-last:mb-4', className)}
    >
      <div className="grid min-w-0 flex-1 basis-60 grid-cols-[minmax(0,1fr)] gap-1">{children}</div>
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{actions}</div>
    </header>
  );
}

/** SectionEyebrow — the overline above a SectionTitle; never a heading. */
export function SectionEyebrow({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={cn('type-overline', className)}>
      {children}
    </span>
  );
}

/** SectionTitle — the `heading` role; an h2 under the page's h1, an h3 for a section nested in another. */
export function SectionTitle({
  children,
  className,
  level = 2,
  ...props
}: Readonly<ComponentPropsWithoutRef<'h2'> & { level?: 2 | 3 }>) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <Heading {...props} className={textRole('heading', className)}>
      {children}
    </Heading>
  );
}

/** SectionDescription — one or two sentences under the title, in `caption`. */
export function SectionDescription({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'p'>>) {
  return (
    <p {...props} className={textRole('caption', className)}>
      {children}
    </p>
  );
}

/** The section's body. */
export function SectionContent({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'div'> & { children: ReactNode }>) {
  return (
    <div {...props} className={className}>
      {children}
    </div>
  );
}

/** A page's sections, stacked at the section gap. */
export function SectionStack({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      data-rhythm-gap=""
      className="flex min-w-0 flex-col gap-[var(--page-section-gap)] *:[--rhythm-gap:var(--page-section-gap)]"
    >
      {children}
    </div>
  );
}
