import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';

import { AGENT_NAV_ITEMS, NEW_CHAT_ITEM } from '@/components/layout/nav-items';
import { DestinationRows, useDestinations } from '@/components/layout/sidebar-nav';
import { RailFlyout, RailLink } from '@/components/layout/sidebar-rail';
import { Button } from '@/components/ui/button';
import { HistoryList, HistoryNotice, HistoryRow, HistoryRows } from '@/components/ui/history-list';
import { MenuItem, MenuLinkItem } from '@/components/ui/menu';
import { SearchField } from '@/components/ui/search-field';
import { RailFlyoutSlot, SidebarNavGroup, SidebarScrollList } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { InlineFigure } from '@/components/ui/typography';
import { CHAT_ORIGIN_LABELS } from '@/lib/agent/handoff';
import { agentQueries, type AgentChatSummary } from '@/lib/api/agent';
import { AGENT_CHAT_LIST_POLL_MS, AGENT_CHAT_SEARCH_DEBOUNCE_MS } from '@/lib/config/agent';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate } from '@/lib/format';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { useDebounced } from '@/lib/use-debounced';

/**
 * Every chat in the project, newest activity first, searchable and paged; a
 * running chat is polled until its turn ends.
 */
function useChatList() {
  const { activeWorkspaceId, activeProjectId } = useProjectContext();
  const [search, setSearch] = useState('');
  const needle = useDebounced(search.trim(), AGENT_CHAT_SEARCH_DEBOUNCE_MS);
  const chats = useInfiniteQuery({
    ...agentQueries.chats(
      { workspaceId: activeWorkspaceId ?? '', projectId: activeProjectId ?? '' },
      { q: needle },
    ),
    enabled: Boolean(activeWorkspaceId && activeProjectId),
    // Several chats can run at once; their markers clear as each turn ends.
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.items.some((chat) => chat.running))
        ? AGENT_CHAT_LIST_POLL_MS
        : false,
  });
  const rows = chats.data?.pages.flatMap((page) => page.items) ?? [];
  let state: 'loading' | 'error' | 'filtered' | 'ready' = needle ? 'filtered' : 'ready';
  if (chats.isPending) state = 'loading';
  else if (chats.isError) state = 'error';
  return {
    search,
    setSearch,
    rows,
    state,
    // Only a new search shows the live rung; background polls while a chat runs do not.
    searching: chats.isFetching && !chats.isFetchingNextPage && !chats.isRefetching,
    more: chats.hasNextPage
      ? { busy: chats.isFetchingNextPage, load: () => void chats.fetchNextPage() }
      : null,
  };
}

type ChatList = ReturnType<typeof useChatList>;

/** The sentence standing in for the rows: none yet, none match, or a failed read. */
function chatListNotice(list: ChatList): string | null {
  if (list.state === 'error') return "Couldn't load chats. Reload to try again.";
  if (list.state === 'loading' || list.rows.length > 0) return null;
  return list.state === 'filtered' ? 'No chats match this search.' : 'No chats yet.';
}

function ChatSearch({
  list,
  onKeyDown,
}: Readonly<{ list: ChatList; onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void }>) {
  return (
    <SearchField
      value={list.search}
      onValueChange={list.setSearch}
      pending={list.searching}
      onKeyDown={onKeyDown}
      aria-label="Search chats"
      placeholder="Search chats"
    />
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

/** The labelled list's chats: search, rows with the running marker, "Show more chats". */
function ChatSection() {
  const list = useChatList();
  const projectHref = useProjectHref();
  const pathname = useLocation().pathname ?? '';
  const notice = chatListNotice(list);
  return (
    <HistoryList
      search={<ChatSearch list={list} />}
      more={
        list.more ? (
          <Button variant="quiet" disabled={list.more.busy} onClick={list.more.load}>
            Show more chats
          </Button>
        ) : null
      }
    >
      {notice ? <HistoryNotice>{notice}</HistoryNotice> : null}
      {list.rows.length > 0 ? (
        <HistoryRows label="Chats">
          {list.rows.map((chat) => {
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
      ) : null}
    </HistoryList>
  );
}

/**
 * Agent mode's list: the "New chat" button; Actions (with the open count),
 * Skills and Context; then the chats.
 */
export function AgentNav() {
  const { location } = useDestinations();
  const { activeWorkspaceId, activeProjectId } = useProjectContext();
  return (
    <SidebarScrollList label="Agent" revealKey={location}>
      <SidebarNavGroup>
        <DestinationRows items={[NEW_CHAT_ITEM, ...AGENT_NAV_ITEMS]} />
      </SidebarNavGroup>
      {activeWorkspaceId && activeProjectId ? <ChatSection /> : null}
    </SidebarScrollList>
  );
}

/** The search field types freely: the menu's typeahead must not take its letters. */
function keepTyping(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key.length === 1 || event.key === 'Backspace' || event.key === ' ') {
    event.stopPropagation();
  }
}

/** The Chats flyout: the search, then the chats as menu links. */
function ChatsFlyout() {
  const list = useChatList();
  const projectHref = useProjectHref();
  const pathname = useLocation().pathname ?? '';
  const notice = chatListNotice(list);
  const current = pathname.startsWith('/agent/chats/');
  return (
    <RailFlyout label="Chats" icon={MessagesSquare} current={current}>
      <RailFlyoutSlot>
        <ChatSearch list={list} onKeyDown={keepTyping} />
      </RailFlyoutSlot>
      {notice ? (
        <RailFlyoutSlot>
          <HistoryNotice>{notice}</HistoryNotice>
        </RailFlyoutSlot>
      ) : null}
      {list.rows.map((chat) => {
        const href = `/agent/chats/${chat.id}`;
        return (
          <MenuLinkItem key={chat.id}>
            <Link to={projectHref(href)} aria-current={pathname === href ? 'page' : undefined}>
              <span className="min-w-0 flex-1 truncate">{chat.title}</span>
              {chat.running ? <Spinner label="Working" /> : null}
            </Link>
          </MenuLinkItem>
        );
      })}
      {list.more ? (
        <MenuItem
          disabled={list.more.busy}
          // Loading more keeps the flyout open on the longer list.
          onSelect={(event) => {
            event.preventDefault();
            list.more?.load();
          }}
        >
          Show more chats
        </MenuItem>
      ) : null}
    </RailFlyout>
  );
}

/** Agent mode in the rail: New chat, Actions, Skills and Context as links, then Chats. */
export function AgentRail() {
  const { isActive, href } = useDestinations();
  const { activeWorkspaceId, activeProjectId } = useProjectContext();
  return (
    <>
      {[NEW_CHAT_ITEM, ...AGENT_NAV_ITEMS].map((item) => (
        <li key={item.href}>
          <RailLink item={{ ...item, href: href(item) }} active={isActive(item)} />
        </li>
      ))}
      {activeWorkspaceId && activeProjectId ? (
        <li>
          <ChatsFlyout />
        </li>
      ) : null}
    </>
  );
}
