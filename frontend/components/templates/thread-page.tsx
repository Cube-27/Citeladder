import type { ReactNode, RefObject } from 'react';

import { PageFrame, type PageFrameSlots } from './page-frame';

/**
 * Thread: the masthead, then the thread across the main column up to
 * 1040px, centred, scrolling in its own region with the composer docked
 * under it, so the window, the masthead and the composer never move as the
 * thread grows. Paragraphs keep a 760px measure (`data-thread`, globals.css);
 * tables, documents, evidence and proposals use the thread's width. The chat
 * list is the Agent-mode sidebar. `scrollRef` reaches the scrolling region;
 * `scrollLabel` names it when it holds a conversation.
 */
export function ThreadPage({
  composer,
  scrollRef,
  scrollLabel,
  children,
  ...slots
}: Omit<PageFrameSlots, 'tabs' | 'filters' | 'back'> &
  Readonly<{
    composer?: ReactNode;
    scrollRef?: RefObject<HTMLElement | null>;
    scrollLabel?: string;
    children: ReactNode;
  }>) {
  return (
    <PageFrame {...slots}>
      <div className="flex h-[calc(100dvh-var(--route-chrome-height))] min-h-0 flex-col gap-[var(--workspace-gap)]">
        {/* The scrollbar's track is reserved on both edges, so the column
            centred in the region shares its centre with the composer. */}
        <section
          ref={scrollRef}
          aria-label={scrollLabel}
          className="min-h-0 flex-1 [scrollbar-gutter:stable_both-edges] overflow-y-auto overscroll-contain"
        >
          <div
            data-page-content=""
            data-thread=""
            className="max-w-thread mx-auto flex min-h-full w-full min-w-0 flex-col gap-[var(--workspace-gap)]"
          >
            {children}
          </div>
        </section>
        {composer ? <div className="max-w-thread mx-auto w-full min-w-0">{composer}</div> : null}
      </div>
    </PageFrame>
  );
}
