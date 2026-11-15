import { useState, type ReactNode, type RefObject } from 'react';
import { History } from 'lucide-react';

import { IconButton } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';

import { PageFrame, type PageFrameSlots } from './page-frame';

/**
 * Thread (brand direction 3.4 and 4): the masthead, then a 720px thread
 * column that scrolls in its own region with the composer docked under it,
 * so the window, the masthead and the composer never move as the thread
 * grows. `history` (the Agent's chats) is a left pane once the main column
 * is 1100 wide (`column-history:`) and a drawer from the masthead's History
 * button below that. `scrollRef` reaches the scrolling region; `scrollLabel`
 * names it when it holds a conversation.
 */
export function ThreadPage({
  history,
  composer,
  scrollRef,
  scrollLabel,
  children,
  ...slots
}: Omit<PageFrameSlots, 'tabs' | 'filters' | 'back'> &
  Readonly<{
    history?: ReactNode;
    composer?: ReactNode;
    scrollRef?: RefObject<HTMLElement | null>;
    scrollLabel?: string;
    children: ReactNode;
  }>) {
  return (
    <PageFrame {...slots} end={history ? <HistoryDrawer>{history}</HistoryDrawer> : undefined}>
      <div className="flex h-[calc(100dvh-var(--route-chrome-height))] min-h-0 gap-[var(--workspace-gap)]">
        {history ? (
          <aside
            aria-label="History"
            className="column-history:flex border-rule hidden w-[var(--history-pane-width)] shrink-0 flex-col overflow-y-auto border-e pe-[var(--card-padding)]"
          >
            {history}
          </aside>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-[var(--workspace-gap)]">
          {/* The scrollbar's track is reserved on both edges, so the column
              centred in the region shares its centre with the composer. */}
          <section
            ref={scrollRef}
            aria-label={scrollLabel}
            className="min-h-0 flex-1 [scrollbar-gutter:stable_both-edges] overflow-y-auto overscroll-contain"
          >
            <div
              data-page-content=""
              className="mx-auto flex min-h-full w-full max-w-prose min-w-0 flex-col gap-[var(--workspace-gap)]"
            >
              {children}
            </div>
          </section>
          {composer ? <div className="mx-auto w-full max-w-prose min-w-0">{composer}</div> : null}
        </div>
      </div>
    </PageFrame>
  );
}

/** The masthead's History button below a 1100px main column, and the drawer it opens. */
function HistoryDrawer({ children }: Readonly<{ children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  return (
    <span className="column-history:hidden contents">
      <IconButton
        icon={History}
        label="History"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        side="left"
        title="History"
        closeLabel="Close history"
      >
        {children}
      </Drawer>
    </span>
  );
}
