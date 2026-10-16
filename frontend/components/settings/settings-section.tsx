import { useId, type ReactNode } from 'react';

import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * A settings page as a ruled list of sections: each section names itself in a
 * narrow column (title and one line of help) and holds its controls in the
 * wide one, so every field on the page starts at the same edge. In a narrow
 * container (a dialog, a phone) the two columns stack.
 *
 * Put the sections inside `SettingsSections`, which owns the rules between
 * them and the container the columns respond to.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: Readonly<{
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'grid gap-4 py-[var(--page-section-gap)] first:pt-0 last:pb-0 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @2xl:gap-[var(--page-section-gap)]',
        className,
      )}
    >
      <div className="grid content-start gap-1">
        <h2 id={headingId} className={textRole('sectionTitle')}>
          {title}
        </h2>
        {description ? <p className={textRole('caption')}>{description}</p> : null}
      </div>
      <div className="grid min-w-0 content-start gap-4">{children}</div>
    </section>
  );
}

/**
 * Read-only facts inside a section: one ruled row per label and value, the
 * labels in one column so every value starts at the same edge.
 */
export function SettingsFacts({
  facts,
}: Readonly<{ facts: ReadonlyArray<readonly [label: string, value: ReactNode]> }>) {
  return (
    <dl className="divide-border-subtle grid divide-y">
      {facts.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 py-2 first:pt-0 last:pb-0"
        >
          <dt className={textRole('label')}>{label}</dt>
          <dd className={textRole('body', 'text-foreground tabular-nums')}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SettingsSections({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={cn('@container', className)}>
      <div className="divide-border-subtle grid divide-y">{children}</div>
    </div>
  );
}
