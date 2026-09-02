import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

/** Shared editorial structures for authenticated analytical workspaces. */

/**
 * The hairline band: a row of peers separated by rules rather than boxed
 * individually. `MetricGroup` is the `<dl>` flavour for label/value pairs;
 * these classes are the same recipe for bands whose cells are not `dt`/`dd`
 * (a score ring, an icon header with an action) and so cannot live in a `<dl>`.
 *
 * The caller supplies the column count — `sm:grid-cols-3`, `xl:grid-cols-4` —
 * at the single breakpoint where the band becomes one row. Pairing the edge
 * padding with that same breakpoint is what keeps the first and last cells
 * flush with the page margin; splitting them across two breakpoints leaves the
 * second row indented.
 */
export const hairlineBandClasses =
  'border-border-subtle divide-border-subtle grid divide-y border-y sm:divide-x sm:divide-y-0';

export const hairlineBandItemClasses = 'min-w-0 py-3 sm:px-4 sm:first:ps-0 sm:last:pe-0';
export function MetricGroup({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'dl'>>) {
  return (
    <dl
      {...props}
      className={cn(
        'divide-border-subtle grid divide-y sm:grid-cols-2 sm:divide-x-0 sm:divide-y-0 sm:[&>*]:border-b sm:[&>*]:border-border-subtle sm:[&>*:nth-child(odd)]:border-r sm:[&>*:nth-last-child(-n+2)]:border-b-0 sm:[&>*:nth-last-child(2):nth-child(even)]:border-b lg:grid-flow-col lg:auto-cols-fr lg:[&>*]:border-r lg:[&>*]:border-b-0 lg:[&>*:last-child]:border-r-0',
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function MetricItem({
  label,
  value,
  detail,
  marker,
  className,
}: Readonly<{
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  marker?: ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'min-w-0 px-0 py-3 sm:px-4 sm:odd:ps-0 sm:even:pe-0 sm:last:pe-0 lg:px-4 lg:odd:ps-4 lg:even:pe-4 lg:first:ps-0 lg:last:pe-0',
        className,
      )}
    >
      <dt className={cn(eyebrowClasses, 'flex min-w-0 items-center justify-between gap-2')}>
        <span className="truncate">{label}</span>
        {marker}
      </dt>
      <dd className="text-foreground mt-2 text-3xl font-medium tracking-[-0.02em] tabular-nums">
        {value}
      </dd>
      {detail ? <dd className="text-muted mt-1 text-xs">{detail}</dd> : null}
    </div>
  );
}

/**
 * The section header for an authenticated screen: an optional meta label, the
 * title, one line of description, and the section's actions on the same row.
 *
 * `ruled` hangs the header off a hairline. That rule — not a border around the
 * content beneath it — is what separates one section from the next now that the
 * canvas is paper; boxing a section and then boxing its contents was how screens
 * ended up three frames deep.
 */
export function EditorialSectionHeader({
  title,
  headingId,
  description,
  actions,
  ruled = false,
  className,
}: Readonly<{
  title: ReactNode;
  /** Target for the section's `aria-labelledby`. */
  headingId?: string;
  description?: ReactNode;
  actions?: ReactNode;
  ruled?: boolean;
  className?: string;
}>) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-4',
        ruled && 'border-border-subtle border-t pt-3',
        className,
      )}
    >
      <div className="grid gap-1">
        <h2 id={headingId} className="text-foreground text-lg font-medium">
          {title}
        </h2>
        {description ? <p className="text-secondary max-w-[72ch] text-sm">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}

export function WorkspacePane({
  children,
  selected = false,
  surface = 'open',
  className,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'section'> & {
    selected?: boolean;
    surface?: 'open' | 'tonal' | 'object';
  }
>) {
  return (
    <section
      {...props}
      className={cn(
        'min-w-0',
        surface === 'tonal' && 'bg-well rounded-[var(--radius-card)]',
        surface === 'object' && 'bg-panel rounded-[var(--radius-card)]',
        selected && 'bg-accent-soft ring-accent-border rounded-[var(--radius-card)] ring-1',
        className,
      )}
    >
      {children}
    </section>
  );
}
