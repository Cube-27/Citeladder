import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { HistoryList, HistoryNotice, HistoryRow, HistoryRows } from '@/components/ui/history-list';
import { SearchField } from '@/components/ui/search-field';
import { InlineFigure } from '@/components/ui/typography';
import { CHAT_ORIGIN_LABELS } from '@/lib/agent/handoff';
import { agentQueries, type AgentChatSummary } from '@/lib/api/agent';
import { AGENT_CHAT_LIST_POLL_MS, AGENT_CHAT_SEARCH_DEBOUNCE_MS } from '@/lib/config/agent';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate } from '@/lib/format';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useDebounced } from '@/lib/use-debounced';

/**
 * History: every chat in the project, newest activity first, searchable and
 * paged, a running chat marked with the live rung; a cut title shows in full
 * on hover and focus. The Thread template shows it beside the thread or in a
 * drawer (brand direction 4).
 */
export function ChatHistory() {
  const { workspaceId, projectId } = useProjectScope();
  const pathname = useLocation().pathname ?? '';
  const [search, setSearch] = useState('');
  const needle = useDebounced(search.trim(), AGENT_CHAT_SEARCH_DEBOUNCE_MS);
  const chats = useInfiniteQuery({
    ...agentQueries.chats({ workspaceId, projectId }, { q: needle }),
    // Several chats can run at once; their markers clear as each turn ends.
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.items.some((chat) => chat.running))
        ? AGENT_CHAT_LIST_POLL_MS
        : false,
  });
  const rows = chats.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <HistoryList
      search={
        <SearchField
          value={search}
          onValueChange={setSearch}
          // Only a new search shows the live rung; background polls while a chat runs do not.
          pending={chats.isFetching && !chats.isFetchingNextPage && !chats.isRefetching}
          aria-label="Search chats"
          placeholder="Search chats"
        />
      }
      more={
        chats.hasNextPage ? (
          <Button
            variant="quiet"
            disabled={chats.isFetchingNextPage}
            onClick={() => void chats.fetchNextPage()}
          >
            Show more chats
          </Button>
        ) : null
      }
    >
      <ChatRows
        rows={rows}
        state={chatListState(chats.isPending, chats.isError, needle)}
        pathname={pathname}
      />
    </HistoryList>
  );
}

function chatListState(pending: boolean, error: boolean, needle: string) {
  if (pending) return 'loading';
  if (error) return 'error';
  return needle ? 'filtered' : 'ready';
}

function ChatRows({
  rows,
  state,
  pathname,
}: Readonly<{
  rows: AgentChatSummary[];
  state: 'loading' | 'error' | 'filtered' | 'ready';
  pathname: string;
}>) {
  const projectHref = useProjectHref();
  if (state === 'loading') return null;
  if (state === 'error') return <HistoryNotice>Chats could not be loaded.</HistoryNotice>;
  if (rows.length === 0)
    return (
      <HistoryNotice>
        {state === 'filtered' ? 'No chats match this search.' : 'No chats yet.'}
      </HistoryNotice>
    );
  return (
    <HistoryRows label="Chats">
      {rows.map((chat) => {
        const href = `/agent/chats/${chat.id}`;
        return (
          <HistoryRow
            key={chat.id}
            href={projectHref(href)}
            active={pathname === href}
            title={chat.title}
            meta={<ChatMeta chat={chat} />}
            working={chat.running}
          />
        );
      })}
    </HistoryRows>
  );
}

/** Where the chat started and when it last moved ("Website · Nov 12, 2026"). */
function ChatMeta({ chat }: Readonly<{ chat: AgentChatSummary }>) {
  const timeZone = useDisplayTimeZone();
  return (
    <>
      {CHAT_ORIGIN_LABELS[chat.origin]} ·{' '}
      <InlineFigure>
        <time dateTime={chat.last_activity_at}>
          {formatDisplayDate(chat.last_activity_at, timeZone)}
        </time>
      </InlineFigure>
    </>
  );
}
