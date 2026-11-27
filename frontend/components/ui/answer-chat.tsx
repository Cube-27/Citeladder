import type { ReactNode } from 'react';

import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/text-role';
import { ArrowUpRight } from '@/lib/icons';
import { cn } from '@/lib/utils';

export function AnswerLayout({
  main,
  rail,
  railLabel,
}: Readonly<{ main: ReactNode; rail: ReactNode; railLabel: string }>) {
  return (
    <div className="desktop:grid-cols-[minmax(0,1fr)_20rem] gap-y-panel-inset grid min-w-0">
      <div className="desktop:pe-panel-inset gap-panel-inset grid min-w-0 content-start">
        {main}
      </div>
      <aside
        aria-label={railLabel}
        className="desktop:border-s desktop:ps-panel-inset border-rule gap-workspace flex min-w-0 flex-col"
      >
        {rail}
      </aside>
    </div>
  );
}

export function ChatThread({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <ol aria-label={label} className="gap-workspace flex min-w-0 flex-col">
      {children}
    </ol>
  );
}

export function ChatAvatar({
  tone,
  children,
}: Readonly<{ tone: 'you' | 'engine'; children: ReactNode }>) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full',
        tone === 'you' ? 'bg-mark-ink text-on-ink' : 'bg-well text-ink',
      )}
    >
      {children}
    </span>
  );
}

export function UserMessage({
  avatar,
  children,
}: Readonly<{ avatar: ReactNode; children: ReactNode }>) {
  return (
    <li className="flex items-start justify-end gap-3">
      <div className="bg-well text-ink text-body rounded-card max-w-[min(80%,var(--container-prose))] px-4 py-3">
        {children}
      </div>
      {avatar}
    </li>
  );
}

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

export function YouMark() {
  return (
    <span className="bg-accent-wash text-accent-text rounded-mark text-eyebrow font-emphasis px-1">
      You
    </span>
  );
}

const CHIP =
  'text-caption text-ink-2 inline-flex max-w-full min-w-0 items-center gap-1 rounded-mark border px-1 align-baseline no-underline';

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
    <span {...data} className={cn(CHIP, 'border-accent text-ink bg-panel border-dashed')}>
      <span className="text-accent-text font-emphasis tabular-nums">
        <span className="sr-only">Position </span>
        {position}
      </span>
      {mark}
      <span className="font-emphasis min-w-0 [overflow-wrap:anywhere]">{children}</span>
      {you ? <YouMark /> : null}
    </span>
  );
}

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
        'border-transparent bg-state-hover text-ink hover:overlay-hover no-underline',
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

export function RailSection({
  title,
  count,
  children,
}: Readonly<{ title: string; count?: number; children: ReactNode }>) {
  return (
    <section className="border-rule flex min-w-0 flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className={textRole('emphasis')}>
        {title}
        {count ? <span className="text-ink-2 tabular-nums"> ({count})</span> : null}
      </h3>
      {children}
    </section>
  );
}

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

export function RailLine({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="flex min-w-0 items-center gap-2">{children}</span>;
}

export function RailItem({ children }: Readonly<{ children: ReactNode }>) {
  return <li className="flex min-w-0 flex-col gap-1">{children}</li>;
}

export function RailUrl({
  href,
  text,
  trailing,
}: Readonly<{ href: string | null; text: string; trailing?: ReactNode }>) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-2">
      <TextLink
        variant="external"
        text="caption"
        underline="hover"
        href={href}
        title={text}
        className="text-ink-2 flex min-w-0 items-center [&>svg]:shrink-0"
      >
        <span className="min-w-0 truncate">{text}</span>
      </TextLink>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </span>
  );
}

export function RailRank({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="text-caption text-ink-2 w-6 shrink-0 tabular-nums">{children}</span>;
}

export function RailCount({ label, children }: Readonly<{ label: string; children: number }>) {
  return (
    <span title={label} className="text-caption text-ink-2 shrink-0 tabular-nums">
      ({children})
    </span>
  );
}

export function QueryItem({ children }: Readonly<{ children: ReactNode }>) {
  return <li className="text-body text-ink bg-well rounded-mark px-2 py-1">{children}</li>;
}
