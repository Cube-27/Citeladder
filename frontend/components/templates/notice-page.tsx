import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { Icon } from '@/components/ui/icon';
import { StateBlock } from '@/components/ui/state-block';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

import { FLOW_CARD } from './flow-page';
import { PageFrame } from './page-frame';

/**
 * What a full-page notice says: a gate, a dead end, a failure, or the
 * workspace still loading (the StateBlock loader, its heading the status).
 */
type NoticeTone = 'info' | 'warning' | 'negative' | 'loading';

/** Each tone's glyph, its ink and the label's word. */
const TONE: Readonly<
  Record<Exclude<NoticeTone, 'loading'>, readonly [glyph: LucideIcon, ink: string, word: string]>
> = {
  info: [Info, 'text-info', 'Notice'],
  warning: [TriangleAlert, 'text-warning', 'Warning'],
  negative: [CircleAlert, 'text-negative', 'Error'],
};

type NoticeContent = Readonly<{
  tone: NoticeTone;
  /** The notice's heading, in the `title` role outside the shell. */
  heading: string;
  /** A glyph for this notice in place of its tone's (not found: a search). */
  icon?: LucideIcon;
  /** The card's label in place of the tone's word; `null` for none (not found). */
  label?: string | null;
  /** The sentence: what happened and, when the reader can fix it, the one next step. */
  children?: ReactNode;
  /** The ways forward, primary first. */
  actions?: ReactNode;
}>;

/**
 * The full-page Notice, its label in `caption-strong` (the tone's word, or
 * `label`): the tone's glyph beside the heading (never colour alone), the
 * sentence 8 under it (at most 72 characters wide) and the ways forward 16
 * under that, on the main column's one left edge. Outside the shell it is a
 * card and its heading is the page's `h1`; under a masthead (`heading` null)
 * it sits on the surface, unboxed, the masthead's title the one heading and
 * the glyph leading the sentence (FOC-03).
 */
function NoticeBlock({
  tone,
  heading,
  icon,
  label,
  children,
  actions,
}: Omit<NoticeContent, 'heading'> & Readonly<{ heading: string | null }>) {
  // One loader for a wait that passes through several owners: it hands over without a blank beat.
  if (tone === 'loading')
    return <StateBlock kind="loading" label={heading ?? undefined} shape={{ kind: 'list' }} />;
  const [glyph, ink, word] = TONE[tone];
  const mark = <Icon icon={icon ?? glyph} className={ink} />;
  return (
    <section
      data-notice-tone={tone}
      className={cn('flex w-full flex-col gap-4', heading && FLOW_CARD)}
    >
      {label === null ? null : <p className={textRole('captionStrong')}>{label ?? word}</p>}
      <div className="flex flex-col gap-2">
        {heading ? (
          <div className="flex items-start gap-2">
            <span className="flex h-7 items-center">{mark}</span>
            <h1 className={textRole('title', 'min-w-0 text-balance')}>{heading}</h1>
          </div>
        ) : null}
        {children ? (
          <div className="flex items-start gap-2">
            {heading ? null : mark}
            <div className={textRole('body', 'flex max-w-[72ch] min-w-0 flex-col gap-2')}>
              {children}
            </div>
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}

/**
 * Notice page inside the shell: the masthead titled with the notice's heading
 * (its one `h1`), then the Notice on the surface where the content begins. Not found, a
 * screen that failed, a workspace with no projects, the workspace loading
 * (which keeps the route's title).
 */
export function NoticePage({ heading, ...notice }: NoticeContent) {
  const loading = notice.tone === 'loading';
  return (
    <PageFrame title={loading ? undefined : heading}>
      <NoticeBlock {...notice} heading={loading ? heading : null} />
    </PageFrame>
  );
}

/**
 * Notice page before the shell can open (a route that failed, access that
 * ended, the session loading), inside `FirstFrame`'s `main`: the card and
 * its one heading, 48 from the top.
 */
export function NoticeScreen(notice: NoticeContent) {
  useDocumentTitle(notice.tone === 'loading' ? undefined : notice.heading);
  return (
    <div className="flex min-w-0 flex-col pt-[var(--flow-gap)]">
      <NoticeBlock {...notice} />
    </div>
  );
}
