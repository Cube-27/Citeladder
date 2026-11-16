import { useId, useState, type ReactNode } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { ProjectLink } from '@/components/ui/project-link';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * A record's reading page (the Actions v3 Action and URL pages): one centred
 * prose column with a quiet way back, the h1, labelled sections and a
 * Details card. It ends in room for a dock held over its bottom.
 */
export function ReadingColumn({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="mx-auto flex w-full max-w-prose min-w-0 flex-col pb-24">{children}</div>;
}

export function BackLink({
  href,
  state,
  children,
}: Readonly<{ href: string; state?: unknown; children: string }>) {
  return (
    <ProjectLink
      href={href}
      state={state}
      className={textRole(
        'body',
        'text-ink-2 hover:text-ink focus-ring mb-3 self-start truncate rounded-sm',
      )}
    >
      ← {children}
    </ProjectLink>
  );
}

export function PageHeading({ children }: Readonly<{ children: string }>) {
  return <h1 className={textRole('title', 'mb-5 break-words')}>{children}</h1>;
}

/** The row of ways to take the record elsewhere, under its overview. */
export function ReadingTools({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}

/** A section under a small grey label ("Overview", "What to do"). */
export function Labelled({
  title,
  caption,
  children,
}: Readonly<{
  title: string;
  /** Who wrote the words below, when it was not CiteLadder ("Suggested by the agent"). */
  caption?: string | null;
  children: ReactNode;
}>) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-6 flex min-w-0 flex-col gap-2">
      <h2 id={id} className={textRole('caption', 'text-ink-2')}>
        {title}
      </h2>
      {children}
      {caption ? <p className={textRole('caption', 'text-ink-2')}>{caption}</p> : null}
    </section>
  );
}

export function Prose({ children }: Readonly<{ children: ReactNode }>) {
  return <p className={textRole('prose', 'break-words')}>{children}</p>;
}

export type DetailFact = Readonly<{ label: string; value: ReactNode }>;

/** The "Details" card: a 120px label column, one fact a row. */
export function DetailsCard({
  facts,
  first,
}: Readonly<{ facts: readonly DetailFact[]; first?: boolean }>) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn('border-rule rounded-card border px-4 py-4', first ? 'mt-0' : 'mt-6')}
    >
      <h2 id={id} className={textRole('label', 'mb-3')}>
        Details
      </h2>
      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-y-3">
        {facts.map((fact) => (
          <div key={fact.label} className="contents">
            <dt className={textRole('body', 'text-ink-2')}>{fact.label}</dt>
            <dd className={textRole('body', 'flex min-w-0 items-center gap-2')}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * "What to do" as a checklist the reader ticks while working through it.
 * The ticks are the reader's own scratch marks: nothing is saved.
 */
export function Checklist({ items }: Readonly<{ items: readonly string[] }>) {
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());
  return (
    <ul className="flex flex-col">
      {items.map((item, index) => (
        <li key={item} className={textRole('prose', 'flex items-start gap-3 py-1')}>
          <Checkbox
            aria-label={item}
            className="mt-1"
            checked={done.has(index)}
            onCheckedChange={() =>
              setDone((current) => {
                const next = new Set(current);
                if (!next.delete(index)) next.add(index);
                return next;
              })
            }
          />
          <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}
