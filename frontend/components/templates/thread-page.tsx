import type { ReactNode, RefObject } from 'react';

import { ThreadLayout } from '@/components/ui/page-chrome';
import {
  ComposerBlocks,
  DockedComposerBlocks,
  OpeningTitleBlocks,
  ShapeBlocks,
  SkeletonFrame,
} from '@/components/ui/skeleton-block';

import { PageFrame, type PageFrameSlots } from './page-frame';

export function ThreadPageLoading({ label = 'Loading the chat…' }: Readonly<{ label?: string }>) {
  return (
    <ThreadPage composer={<DockedComposerBlocks />}>
      <SkeletonFrame label={label} variant="thread">
        <ShapeBlocks shape={{ kind: 'thread' }} />
      </SkeletonFrame>
    </ThreadPage>
  );
}

export function NewChatLoading() {
  return (
    <ThreadPage>
      <SkeletonFrame label="Loading the Agent…" variant="new-chat" layout="opening">
        <OpeningTitleBlocks />
        <ComposerBlocks />
      </SkeletonFrame>
    </ThreadPage>
  );
}

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
    <PageFrame {...slots} head="masthead" end="thread">
      <ThreadLayout scrollRef={scrollRef} scrollLabel={scrollLabel} composer={composer}>
        {children}
      </ThreadLayout>
    </PageFrame>
  );
}
