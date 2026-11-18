import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { StateHeadingLevelContext } from '@/components/ui/state-block';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * What a section draws:
 *   `surface` — the default: no box. Its head (title, a one-line description,
 *               actions at the right) and its body sit straight on the page
 *               surface; space and the heading separate it from its neighbours.
 *   `framed`  — opt-in, for the few blocks that earn a box: a light `rule`
 *               frame at the card radius, padded 16, with no fill or shadow.
 * Tables and charts draw their own frame; a section never boxes them again.
 */
export type SectionVariant = 'surface' | 'framed';

const SECTION_FACE: Record<SectionVariant, string> = {
  surface: '',
  framed: 'border-rule rounded-card border p-[var(--card-padding)]',
};

/**
 * Section — the default grouping on every page. It owns the rhythm above it:
 * sections sit 32 apart (globals.css, `surface-section`), so a page sets no
 * vertical gap. It sets no display of its own, so a sticky child keeps its
 * scroll container.
 */
export function Section({
  children,
  className,
  variant = 'surface',
  ...props
}: Readonly<ComponentPropsWithoutRef<'section'> & { variant?: SectionVariant }>) {
  return (
    <section
      {...props}
      data-section={variant}
      className={cn('surface-section min-w-0', SECTION_FACE[variant], className)}
    >
      {/* Under the section's h2 title, a block state's heading is an h3. */}
      <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
    </section>
  );
}

/**
 * SectionHeader — the section's head, always on top of its body: the title and,
 * 4 below, the caption on the left; `actions` (a quiet Button, a small control
 * group, or a count as caption text) top-aligned at the right end of the title
 * row, 8 apart. When the row is too narrow the actions wrap under the caption,
 * left-aligned. A status belongs on the title's line, 8 after it. The body
 * starts 16 below, with no rule between.
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

/** SectionTitleLine — the title with the section's status right after it, 8 apart. */
export function SectionTitleLine({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>;
}

/** SectionDescription — one or two sentences under the title, `body` in `ink-2`, at most 72 characters wide. */
export function SectionDescription({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'p'>>) {
  return (
    <p {...props} className={textRole('body', cn('text-ink-2 max-w-[72ch]', className))}>
      {children}
    </p>
  );
}

/** A form section's foot: under a `rule` 16 below the body, its actions right-aligned 16 under it. */
export function SectionFoot({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="border-rule mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
      {children}
    </div>
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

/**
 * TitledSection — the common module: a Section headed by its h2 title, an
 * optional caption and trailing actions, then the body (a DataTable named by
 * `label`, a chart, a list). It adds no landmark of its own, so a table
 * inside stays the one region with that name.
 */
export function TitledSection({
  title,
  description,
  actions,
  variant,
  children,
  className,
}: Readonly<{
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  variant?: SectionVariant;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <Section variant={variant} className={className}>
      <SectionHeader actions={actions}>
        <SectionTitle>{title}</SectionTitle>
        {description ? <SectionDescription>{description}</SectionDescription> : null}
      </SectionHeader>
      {children}
    </Section>
  );
}

/** A page's sections, 32 apart. */
export function SectionStack({
  children,
  ...props
}: Readonly<{ children: ReactNode; 'aria-busy'?: boolean }>) {
  return (
    <div
      {...props}
      data-rhythm-gap="section"
      className="flex min-w-0 flex-col gap-[var(--page-section-gap)]"
    >
      {children}
    </div>
  );
}
