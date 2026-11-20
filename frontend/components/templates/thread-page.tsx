import type { ReactNode, RefObject } from 'react';

import {
  ComposerBlocks,
  ShapeBlocks,
  SkeletonBlock,
  SkeletonFrame,
} from '@/components/ui/skeleton-block';

import { PageFrame, type PageFrameSlots } from './page-frame';

/**
 * A chat as it loads, in the loaded chat's frame: the thread column with the
 * person's turn and the reply's paragraphs, then the docked composer's card
 * (ComposerDock's 8 above and 16 below).
 */
export function ThreadPageLoading({ label = 'Loading the chat…' }: Readonly<{ label?: string }>) {
  return (
    <ThreadPage
      composer={
        <div className="shrink-0 pt-2 pb-4">
          <ComposerBlocks />
        </div>
      }
    >
      <SkeletonFrame label={label} variant="thread">
        <ShapeBlocks shape={{ kind: 'thread' }} />
      </SkeletonFrame>
    </ThreadPage>
  );
}

/**
 * The new chat as it loads: the greeting's centred block (20×240) over the
 * composer's card, centred in the thread column as NewChat is.
 */
export function NewChatLoading() {
  return (
    <ThreadPage>
      <SkeletonFrame
        label="Loading the Agent…"
        variant="new-chat"
        className="my-auto flex flex-col gap-[var(--page-section-gap)]"
      >
        <span className="flex h-7 items-center justify-center">
          <SkeletonBlock className="h-5 w-60 max-w-full" />
        </span>
        <ComposerBlocks />
      </SkeletonFrame>
    </ThreadPage>
  );
}

/**
 * Thread: the masthead, then the thread across the page (the Agent's routes
 * are narrow, `max-w-thread`), scrolling in its own region with the composer docked
 * under it, so the panel, the page header and the composer never move as the
 * thread grows. Every turn, its prose included, spans the thread's width, so
 * its edges meet the composer's. The chat list is the Agent-mode sidebar. `scrollRef` reaches the scrolling region;
 * `scrollLabel` names it when it holds a conversation.
 */
export function ThreadPage({
  composer,
  scrollRef,
  scrollLabel,
  children,
  ...slots
}: Omit<PageFrameSlots, 'tabs' | 'filters' | 'trail' | 'crumb'> &
  Readonly<{
    composer?: ReactNode;
    scrollRef?: RefObject<HTMLElement | null>;
    scrollLabel?: string;
    children: ReactNode;
  }>) {
  return (
    <PageFrame {...slots} fitted>
      <div className="flex h-[calc(100dvh-var(--route-chrome-height))] min-h-0 flex-col gap-[var(--workspace-gap)]">
        {/* The scrollbar's track is reserved at the end only, so the thread
            starts on the composer's start edge and its scrollbar ends on the
            composer's end edge, and nothing moves when the thread overflows. */}
        <section
          ref={scrollRef}
          aria-label={scrollLabel}
          className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain"
        >
          <div
            data-page-content=""
            data-thread=""
            className="flex min-h-full w-full min-w-0 flex-col gap-[var(--workspace-gap)]"
          >
            {children}
          </div>
        </section>
        {composer ? <div className="w-full min-w-0">{composer}</div> : null}
      </div>
    </PageFrame>
  );
}
