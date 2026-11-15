import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { Icon } from '@/components/ui/icon';
import { StateBlock } from '@/components/ui/state-block';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

import { PageFrame } from './page-frame';

/**
 * What a full-page notice says: a gate, a dead end, a failure, or the
 * workspace still loading (the StateBlock loader, its heading the status).
 */
type NoticeTone = 'info' | 'warning' | 'negative' | 'loading';

/** Each tone's glyph, its ink and the overline's word. */
const TONE: Readonly<
  Record<Exclude<NoticeTone, 'loading'>, readonly [glyph: LucideIcon, ink: string, word: string]>
> = {
  info: [Info, 'text-info', 'Notice'],
  warning: [TriangleAlert, 'text-warning', 'Warning'],
  negative: [CircleAlert, 'text-negative', 'Error'],
};

type NoticeContent = Readonly<{
  tone: NoticeTone;
  /** The notice's heading, in the display face. */
  heading: string;
  /** A glyph for this notice in place of its tone's (not found: a search). */
  icon?: LucideIcon;
  /** The card's label, in place of the tone's word ("Not found"). */
  overline?: string;
  /** The sentence: what happened and, when the reader can fix it, the one next step. */
  children?: ReactNode;
  /** The ways forward, primary first. */
  actions?: ReactNode;
}>;

/**
 * The full-page Notice in a card, its label in `caption-strong` (the tone's
 * word, or `overline`): the tone's glyph beside the heading (never colour
 * alone), the sentence 8 under it (at most 72 characters wide) and the ways
 * forward 16 under that, on the main column's one left edge. `level` 1 when it is
 * the page's only heading (outside the shell), 2 under a masthead.
 */
function NoticeBlock({
  tone,
  heading,
  icon,
  overline,
  children,
  actions,
  level,
}: NoticeContent & Readonly<{ level: 1 | 2 }>) {
  // One loader for a wait that passes through several owners: it hands over without a blank beat.
  if (tone === 'loading') return <StateBlock kind="loading" label={heading} />;
  const Heading = level === 1 ? 'h1' : 'h2';
  const [glyph, ink, word] = TONE[tone];
  return (
    <section
      data-notice-tone={tone}
      className="bg-surface border-rule rounded-card shadow-card flex w-full flex-col gap-4 border p-[var(--page-top-gap)]"
    >
      <p className={textRole('captionStrong')}>{overline ?? word}</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <Icon icon={icon ?? glyph} className={cn('mt-1 size-5 shrink-0', ink)} />
          <Heading className={textRole('display', 'min-w-0 text-balance')}>{heading}</Heading>
        </div>
        {children ? (
          <div className={textRole('body', 'flex max-w-[72ch] flex-col gap-2')}>{children}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}

/**
 * Notice page inside the shell: the masthead named for
 * the page, then the full-page Notice where the content begins. Not found, a
 * screen that failed, a workspace with no projects, the workspace loading.
 */
export function NoticePage({ title, ...notice }: NoticeContent & Readonly<{ title?: string }>) {
  return (
    <PageFrame title={title}>
      <NoticeBlock {...notice} level={2} />
    </PageFrame>
  );
}

/**
 * Notice page outside the shell, before it can open (a route that failed,
 * access that ended, the session loading): the page's own `main` and its
 * one heading, 48 from the top. The caller supplies the frame around it.
 */
export function NoticeScreen(notice: NoticeContent) {
  useDocumentTitle(notice.tone === 'loading' ? undefined : notice.heading);
  return (
    <main id="main" className="flex min-w-0 flex-col pt-[var(--flow-gap)]">
      <NoticeBlock {...notice} level={1} />
    </main>
  );
}
