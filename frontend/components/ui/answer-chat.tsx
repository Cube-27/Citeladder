import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The answer view's organism: an answer drawn as the chat it was. A thread of
 * messages (the prompt on the right as your message, the engine's reply on
 * the left), inline chips for what the reply names and cites, and the rail
 * beside it. Feature code composes these and sets no geometry of its own.
 */

/** The thread beside its rail; the rail drops under the thread below `desktop:`. */
export function AnswerLayout({
  main,
  rail,
  railLabel,
}: Readonly<{ main: ReactNode; rail: ReactNode; railLabel: string }>) {
  return (
    <div className="desktop:grid-cols-[minmax(0,1fr)_20rem] grid min-w-0 gap-[var(--workspace-gap)]">
      <div className="grid min-w-0 content-start gap-[var(--workspace-gap)]">{main}</div>
      <aside
        aria-label={railLabel}
        className="desktop:border-s desktop:pl-4 border-rule flex min-w-0 flex-col gap-[var(--workspace-gap)]"
      >
        {rail}
      </aside>
    </div>
  );
}

export function ChatThread({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <ol aria-label={label} className="flex min-w-0 flex-col gap-[var(--workspace-gap)]">
      {children}
    </ol>
  );
}

/** A round 32px avatar: `ink` for you, `well` for an engine. Decorative. */
export function ChatAvatar({
  tone,
  children,
}: Readonly<{ tone: 'you' | 'engine'; children: ReactNode }>) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full',
        tone === 'you' ? 'bg-ink text-on-ink' : 'bg-well text-ink',
      )}
    >
      {children}
    </span>
  );
}

/** Your message: a `well` bubble on the right, its avatar after it. */
export function UserMessage({
  avatar,
  children,
}: Readonly<{ avatar: ReactNode; children: ReactNode }>) {
  return (
    <li className="flex items-start justify-end gap-3">
      <div className="bg-well text-ink type-body rounded-card max-w-[min(80%,var(--container-prose))] px-4 py-3">
        {children}
      </div>
      {avatar}
    </li>
  );
}

/** The engine's reply: avatar, its name, then the reply at full width. */
export function AssistantMessage({
  avatar,
  name,
  children,
}: Readonly<{ avatar: ReactNode; name: ReactNode; children: ReactNode }>) {
  return (
    <li className="flex min-w-0 items-start gap-3">
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className={textRole('label', 'text-ink-2')}>{name}</span>
        {children}
      </div>
    </li>
  );
}

/** The word on your own brand and your own site, small enough to sit inside a chip. */
export function YouMark() {
  return (
    <span className="bg-accent-wash text-accent-text rounded-mark text-eyebrow px-1 font-medium">
      You
    </span>
  );
}

const CHIP =
  'type-caption inline-flex max-w-full min-w-0 items-center gap-1 rounded-mark border px-1 align-baseline no-underline';

/**
 * A name the reply mentions, where it mentions it: its first-mention position,
 * a mark, the words, a dashed accent edge. Plain text, never cut: the answer is
 * shown whole.
 */
export function MentionChip({
  position,
  mark,
  you,
  children,
  ...data
}: Readonly<{
  position: number;
  mark: ReactNode;
  you: boolean;
  children: ReactNode;
  'data-brand-chip'?: string;
}>) {
  return (
    <span {...data} className={cn(CHIP, 'border-accent text-ink bg-surface border-dashed')}>
      <span className="text-accent-text font-medium tabular-nums">
        <span className="sr-only">Position </span>
        {position}
      </span>
      {mark}
      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{children}</span>
      {you ? <YouMark /> : null}
    </span>
  );
}

/** A source the reply cites, where it cites it: favicon, the link's words (never cut), the new-tab arrow. */
export function CitationChip({
  href,
  mark,
  you,
  children,
  ...data
}: Readonly<{
  href: string | null;
  mark: ReactNode;
  you: boolean;
  children: ReactNode;
  'data-source-chip'?: string;
}>) {
  return (
    <ExternalHttpLink
      {...data}
      href={href}
      className={cn(
        CHIP,
        'border-control-edge bg-control-fill text-ink hover:overlay-hover no-underline',
      )}
    >
      {mark}
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
      {you ? <YouMark /> : null}
      <ArrowUpRight aria-hidden className="text-ink-2 size-3 shrink-0" />
      {href ? <span className="sr-only">(opens in a new tab)</span> : null}
    </ExternalHttpLink>
  );
}

/** One rail section: a heading with an optional count, then its body. */
export function RailSection({
  title,
  trailing,
  children,
}: Readonly<{ title: string; trailing?: ReactNode; children: ReactNode }>) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className={textRole('emphasis')}>{title}</h3>
        {trailing ? <span className="type-caption text-ink-2">{trailing}</span> : null}
      </header>
      {children}
    </section>
  );
}

/** A rail's ordered list; `dense` for one-line rows, else room for a stacked row. */
export function RailList({
  label,
  dense = false,
  children,
}: Readonly<{ label: string; dense?: boolean; children: ReactNode }>) {
  return (
    <ol aria-label={label} className={cn('flex flex-col', dense ? 'gap-1' : 'gap-3')}>
      {children}
    </ol>
  );
}

/** One line of a rail row: its parts in a row, the last pushed to the end when `trailing`. */
export function RailLine({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="flex min-w-0 items-center gap-2">{children}</span>;
}

/** A rail row: lines stacked tight. */
export function RailItem({ children }: Readonly<{ children: ReactNode }>) {
  return <li className="flex min-w-0 flex-col gap-1">{children}</li>;
}

/** A rail row's leading figure (a rank), in a fixed column so the names align. */
export function RailRank({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="type-caption text-ink-2 w-6 shrink-0 tabular-nums">{children}</span>;
}

/** A rail row's trailing note, at the end of its line. */
export function RailNote({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="type-caption text-ink-2 ms-auto shrink-0 tabular-nums">{children}</span>;
}

/** One search the engine ran, as its words on the well. */
export function QueryItem({ children }: Readonly<{ children: ReactNode }>) {
  return <li className="type-body bg-well rounded-mark px-2 py-1">{children}</li>;
}
