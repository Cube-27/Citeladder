import { useId, useState, type ReactNode } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { ClampText } from '@/components/ui/clamp-text';
import { ProjectLink } from '@/components/ui/project-link';
import { textRole } from '@/components/ui/typography';

/**
 * A record's reading page (the Actions v3 Action and URL pages): one centred
 * prose column with a quiet way back, the h1, labelled sections and a
 * Details card. Its frame is `fitted`: the column holds the page's end space
 * itself and is at least the window's height, so a dock after it stays at the
 * window's foot however short the page and however far it is scrolled.
 */
export function ReadingColumn({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[var(--container-prose)] min-w-0 flex-col pb-[var(--page-end-space)]">
      {children}
    </div>
  );
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
        'text-ink-2 hover:text-ink focus-ring self-start truncate rounded-sm',
      )}
    >
      ← {children}
    </ProjectLink>
  );
}

/** The page's h1: a record's name, or (`path`) an address on one line, cut with the whole in a tooltip. */
export function PageHeading({ children, path }: Readonly<{ children: string; path?: boolean }>) {
  if (path)
    return (
      <h1 className={textRole('title', 'mt-3 min-w-0')}>
        <ClampText>{children}</ClampText>
      </h1>
    );
  return <h1 className={textRole('display', 'mt-3 break-words')}>{children}</h1>;
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
  return <p className={textRole('body', 'break-words')}>{children}</p>;
}

export type DetailFact = Readonly<{ label: string; value: ReactNode }>;

/** The "Details" facts on the surface: a 120px label column, one fact a row. */
export function DetailsFacts({ facts }: Readonly<{ facts: readonly DetailFact[] }>) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-8 flex flex-col gap-3">
      <h2 id={id} className={textRole('label')}>
        Details
      </h2>
      <dl className="flex flex-col gap-3">
        {facts.map((fact) => (
          <div key={fact.label} className="flex">
            <dt className={textRole('body', 'text-ink-2 w-30 shrink-0')}>{fact.label}</dt>
            <dd className={textRole('body', 'flex min-w-0 flex-1 items-center gap-2')}>
              {fact.value}
            </dd>
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
        <li key={item} className={textRole('body', 'flex items-start gap-3 py-1')}>
          <Checkbox
            aria-label={item}
            className="mt-0.5"
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
