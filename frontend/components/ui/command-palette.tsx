'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { NAV_GROUPS } from '@/components/layout/nav-items';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';

/**
 * CommandPalette — ⌘K / Ctrl+K navigation for the authed shell.
 *
 * Keyboard-first velocity is the point: every nav destination and every
 * project in the workspace is reachable without leaving the home row. The
 * sidebar's command row is the pointer affordance for the same thing.
 *
 * Deliberately NOT built on components/ui/dialog.tsx — that wrapper owns a
 * title/description/close header, which a palette must not have (the input is
 * the header). It uses the same Radix primitive and the same scrim/surface
 * tokens, so the two stay visually consistent.
 *
 * Filtering is a plain substring match over label + group. There is no fuzzy
 * matcher and no index: the corpus is ~12 nav items plus the workspace's
 * projects, where subsequence matching mostly produces surprising ranking for
 * no measurable gain.
 */
type Command = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void;
};

/** Chrome shared by the empty state and each row, so heights never drift. */
const ROW = 'flex w-full items-center gap-3 rounded-md px-3 text-left text-base h-9';

export function CommandPalette() {
  const router = useRouter();
  const { projects, activeProjectId, setActiveProjectId } = useProjectContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listboxId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  // Opening resets the palette. Done in the handler, not an effect — the reset
  // is caused by the interaction, not by state outside React.
  const setOpenState = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery('');
      setActive(0);
    }
  }, []);

  // ⌘K / Ctrl+K toggles from anywhere. Bound on keydown so it beats the
  // browser's own find-in-page on the platforms that map ⌘K.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen((wasOpen) => {
        if (!wasOpen) {
          setQuery('');
          setActive(0);
        }
        return !wasOpen;
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const navigation = NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        id: `nav:${item.href}`,
        label: item.label,
        group: group.title,
        run: () => router.push(item.href),
      })),
    );

    // Switching project re-scopes the API client's workspace header, so this
    // is a genuine action rather than a link.
    const projectCommands = projects.map((project) => ({
      id: `project:${project.id}`,
      // brand_name is required by projectSchema, so there is no fallback to
      // guard here; ProjectSwitcher shows the same label.
      label: project.brand_name,
      group: 'Switch project',
      hint: project.id === activeProjectId ? 'Current' : undefined,
      run: () => setActiveProjectId(project.id),
    }));

    return [...navigation, ...projectCommands];
  }, [router, projects, activeProjectId, setActiveProjectId]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.group}`.toLowerCase().includes(needle),
    );
  }, [commands, query]);

  // The cursor is CLAMPED during render rather than corrected in an effect:
  // typing shrinks the result set, and storing an index that is briefly out of
  // range would render one frame with nothing selected before a corrective
  // pass fixed it. Deriving it means there is no such frame.
  const activeIndex = active >= results.length ? 0 : active;

  // Keep the highlighted row visible when moving by keyboard past the fold.
  // Feature-detected: jsdom does not implement scrollIntoView, and this is
  // presentation-only — losing it must never break selection.
  useEffect(() => {
    const row = listRef.current?.querySelector('[data-active="true"]');
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const runCommand = useCallback((command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    command.run();
  }, []);

  // Movement is relative to the CLAMPED index, so wrapping stays correct even
  // on the render right after a filter shrank the list.
  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((activeIndex + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((activeIndex - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runCommand(results[activeIndex]);
    }
  }

  return (
    <>
      {/* The sidebar's pointer affordance for the same palette. */}
      <button
        type="button"
        onClick={() => setOpenState(true)}
        aria-label="Search or jump to"
        aria-keyshortcuts="Meta+K Control+K"
        className="border-border bg-panel text-muted focus-ring hover:border-border-strong flex h-8 w-full items-center gap-2 rounded-md border px-2 text-left transition-colors"
      >
        <Search className="size-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
        <span className="text-xs">Search or jump to…</span>
        <kbd className="text-subtle ms-auto font-mono text-[10px]">⌘K</kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpenState}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="bg-overlay-scrim fixed inset-0 z-[100]" />
          <DialogPrimitive.Content
            aria-label="Command palette"
            className="border-border bg-elevated shadow-modal-value fixed top-[18%] left-1/2 z-[101] flex max-h-[60vh] w-[560px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-xl border focus:outline-none"
          >
            <div className="border-border-subtle flex items-center gap-3 border-b px-4">
              <Search className="text-muted size-4 shrink-0" aria-hidden strokeWidth={1.75} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search or jump to…"
                aria-label="Search commands"
                aria-controls={listboxId}
                aria-activedescendant={
                  results[activeIndex] ? `${listboxId}-${results[activeIndex].id}` : undefined
                }
                className="text-foreground placeholder:text-muted h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
              />
              <kbd className="text-subtle shrink-0 font-mono text-[10px]">ESC</kbd>
            </div>

            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Commands"
              className="content-scroll min-h-0 flex-1 overflow-y-auto p-2"
            >
              {results.length === 0 ? (
                <p className={cn(ROW, 'text-muted')}>No matches for “{query}”</p>
              ) : (
                results.map((command, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={command.id}
                      id={`${listboxId}-${command.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive}
                      onMouseMove={() => setActive(index)}
                      onClick={() => runCommand(command)}
                      className={cn(
                        ROW,
                        'transition-colors',
                        isActive ? 'bg-accent-subtle text-foreground' : 'text-secondary',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {command.hint ? (
                        <span className="text-muted shrink-0 text-xs">{command.hint}</span>
                      ) : null}
                      <span className="text-subtle shrink-0 text-xs">{command.group}</span>
                    </button>
                  );
                })
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
