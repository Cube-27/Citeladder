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

const TONE_GLYPH: Readonly<Record<Exclude<NoticeTone, 'loading'>, LucideIcon>> = {
  info: Info,
  warning: TriangleAlert,
  negative: CircleAlert,
};

const TONE_INK: Readonly<Record<Exclude<NoticeTone, 'loading'>, string>> = {
  info: 'text-info',
  warning: 'text-warning',
  negative: 'text-negative',
};

const TONE_OVERLINE: Readonly<Record<Exclude<NoticeTone, 'loading'>, string>> = {
  info: 'Notice',
  warning: 'Warning',
  negative: 'Error',
};

type NoticeContent = Readonly<{
  tone: NoticeTone;
  /** The notice's heading, in the display face. */
  heading: string;
  /** A glyph for this notice in place of its tone's (not found: a search). */
  icon?: LucideIcon;
  /** The mono overline on its ink rule, in place of the tone's word ("Not found"). */
  overline?: string;
  /** The sentence: what happened and, when the reader can fix it, the one next step. */
  children?: ReactNode;
  /** The ways forward, primary first. */
  actions?: ReactNode;
}>;

/**
 * The full-page Notice, hung from an ink rule with a mono overline (the
 * tone's word, or `overline`): the tone's glyph beside the heading (never
 * colour alone), the sentence 8 under it and the ways forward 16 under that,
 * on the main column's one left edge in a 480px measure. `level` 1 when it is
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
  return (
    <section
      data-notice-tone={tone}
      className="max-w-flow border-rule-ink flex w-full flex-col border-t pt-3"
    >
      <p className="type-overline mb-4">{overline ?? TONE_OVERLINE[tone]}</p>
      <div className="flex items-start gap-2">
        <Icon
          icon={icon ?? TONE_GLYPH[tone]}
          className={cn('mt-1 size-5 shrink-0', TONE_INK[tone])}
        />
        <Heading className={textRole('display', 'min-w-0 text-balance')}>{heading}</Heading>
      </div>
      {children ? (
        <div className={textRole('body', 'mt-2 flex flex-col gap-2')}>{children}</div>
      ) : null}
      {actions ? (
        <div className="mt-[var(--card-padding)] flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
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
