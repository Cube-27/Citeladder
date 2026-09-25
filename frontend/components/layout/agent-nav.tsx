'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { SearchField } from '@/components/ui/search-field';
import { textRole } from '@/components/ui/typography';
import { OUTPUT_PHASE_LABEL, outputKindLabel } from '@/lib/agent/vocabulary';
import { actionsQueries } from '@/lib/api/actions';
import { agentQueries, type AgentChatSummary } from '@/lib/api/agent';
import { AGENT_CHAT_SEARCH_DEBOUNCE_MS } from '@/lib/config/agent';
import { ICONS } from '@/lib/icons';
import { scopedNavigationDestination } from '@/lib/navigation/project-destination';
import { useRouteIntent } from '@/lib/navigation/use-route-intent';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';

import { NavLink } from './nav-link';
import { AGENT_HOME, AGENT_NAV_ITEMS, isNavItemActive } from './nav-items';

/**
 * Agent mode: New chat, Actions (with the open count), Skills, Context, then
 * every chat in the project, newest activity first, searchable and paged.
 */
export function AgentNav({ onNavigate }: Readonly<{ onNavigate?: () => void }>) {
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const scoped = (href: string) =>
    scopedNavigationDestination(href, 'project', activeProjectId, activeWorkspaceId);
  const pathname = useLocation().pathname ?? '';
  const searchParams = useSearchParams()[0];
  const onIntent = useRouteIntent();
  const openCount = useOpenActionCount(activeWorkspaceId, activeProjectId);
  const NewChatIcon = ICONS.newChat;

  return (
    <nav aria-label="Agent" className="flex min-h-0 flex-col gap-3">
      <Button asChild size="md" className="w-full justify-start">
        <Link to={scoped(AGENT_HOME)} onClick={onNavigate}>
          <NewChatIcon className="size-4" aria-hidden />
          New chat
        </Link>
      </Button>
      <ul className="flex flex-col gap-[var(--sidebar-item-gap)]">
        {AGENT_NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <NavLink
              item={{
                ...item,
                href: scoped(item.href),
                count: item.href === '/agent/actions' ? openCount : undefined,
              }}
              active={isNavItemActive(pathname, searchParams, item)}
              onIntent={onIntent}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
      {activeProjectId && activeWorkspaceId ? (
        <ChatHistory
          workspaceId={activeWorkspaceId}
          projectId={activeProjectId}
          pathname={pathname}
          scoped={scoped}
          onNavigate={onNavigate}
        />
      ) : null}
    </nav>
  );
}

function useOpenActionCount(workspaceId: string | null, projectId: string | null) {
  const query = useQuery({
    ...actionsQueries.list(workspaceId ?? '', projectId ?? ''),
    enabled: Boolean(workspaceId && projectId),
  });
  const counts = query.data?.status_counts;
  return counts ? (counts.open ?? 0) + (counts.in_progress ?? 0) : undefined;
}

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), AGENT_CHAT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

function ChatHistory({
  workspaceId,
  projectId,
  pathname,
  scoped,
  onNavigate,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  pathname: string;
  scoped: (href: string) => string;
  onNavigate?: () => void;
}>) {
  const [search, setSearch] = useState('');
  const needle = useDebounced(search.trim());
  const chats = useInfiniteQuery(agentQueries.chats(workspaceId, projectId, { q: needle }));
  const rows = chats.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="agent-chat-history" className="flex min-h-0 flex-col gap-2">
      <h2 id="agent-chat-history" className={cn(eyebrowClasses, 'text-secondary px-2.5 pt-2')}>
        Chats
      </h2>
      <SearchField
        value={search}
        onValueChange={setSearch}
        pending={chats.isFetching && !chats.isFetchingNextPage}
        aria-label="Search chats"
        placeholder="Search chats"
        size="compact"
      />
      <ChatRows
        rows={rows}
        state={chatListState(chats.isPending, chats.isError, needle)}
        pathname={pathname}
        scoped={scoped}
        onNavigate={onNavigate}
      />
      {chats.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={chats.isFetchingNextPage}
          onClick={() => void chats.fetchNextPage()}
        >
          Show more chats
        </Button>
      ) : null}
    </section>
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
  scoped,
  onNavigate,
}: Readonly<{
  rows: AgentChatSummary[];
  state: 'loading' | 'error' | 'filtered' | 'ready';
  pathname: string;
  scoped: (href: string) => string;
  onNavigate?: () => void;
}>) {
  if (state === 'loading') return null;
  if (state === 'error')
    return <p className={textRole('meta', 'px-2.5')}>Chats could not be loaded.</p>;
  if (rows.length === 0)
    return (
      <p className={textRole('meta', 'px-2.5')}>
        {state === 'filtered' ? 'No chats match this search.' : 'No chats yet.'}
      </p>
    );
  return (
    <ul className="flex flex-col gap-[var(--sidebar-item-gap)]">
      {rows.map((chat) => {
        const href = `/agent/chats/${chat.id}`;
        const active = pathname === href;
        return (
          <li key={chat.id}>
            <Link
              to={scoped(href)}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-ring grid gap-0.5 rounded-[var(--radius-control)] border px-2.5 py-1.5',
                active
                  ? 'border-border bg-panel'
                  : 'hover:bg-active border-transparent text-secondary',
              )}
            >
              <span className={textRole('label', 'truncate text-foreground')}>{chat.title}</span>
              <ChatMeta chat={chat} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ChatMeta({ chat }: Readonly<{ chat: AgentChatSummary }>) {
  const marker =
    chat.output_kind && chat.output_phase
      ? `${outputKindLabel(chat.output_kind)} · ${OUTPUT_PHASE_LABEL[chat.output_phase]}`
      : null;
  if (!chat.target_label && !marker) return null;
  return (
    <span className={textRole('meta', 'truncate')}>
      {[chat.target_label, marker].filter(Boolean).join(' · ')}
    </span>
  );
}
