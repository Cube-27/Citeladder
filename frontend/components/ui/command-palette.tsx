import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useId, useMemo, useRef, useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { FLOAT_FACE } from '@/components/ui/card';
import { CommandPaletteResults, type Command } from '@/components/ui/command-palette-results';
import { Kbd } from '@/components/ui/kbd';
import {
  useCommandPaletteOpen,
  type CommandPaletteLaunch,
} from '@/components/ui/use-command-palette-open';
import { useProjectContext } from '@/lib/project/project-context';
import { useManagedPlan } from '@/lib/billing/entitlement-context';
import {
  scopedNavigationDestination,
  useSelectProject,
} from '@/lib/navigation/project-destination';
import { cn } from '@/lib/utils';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/lib/navigation/shell-events';
import { useRouteIntent } from '@/lib/navigation/use-route-intent';

/** A group of shell destinations the palette lists; the shell supplies them. */
type PaletteGroup = Readonly<{
  title: string;
  items: readonly Readonly<{
    label: string;
    href: string;
    icon: LucideIcon;
    scope: 'project' | 'workspace';
  }>[];
}>;

function subscribeToPlatform() {
  return () => {};
}

function isMacPlatform() {
  return /Mac/i.test(navigator.platform);
}

export function CommandPaletteTrigger({
  className,
  onOpen,
}: Readonly<{
  className?: string;
  /** Lets a transient presenter close before the persistent palette opens. */
  onOpen?: (trigger: HTMLElement) => void;
}>) {
  const isMac = useSyncExternalStore(subscribeToPlatform, isMacPlatform, () => false);
  return (
    <Button
      onClick={(event) => {
        const trigger = event.currentTarget;
        if (onOpen) onOpen(trigger);
        else {
          window.dispatchEvent(
            new CustomEvent<CommandPaletteLaunch>(OPEN_COMMAND_PALETTE_EVENT, {
              detail: { trigger },
            }),
          );
        }
      }}
      aria-label="Search or jump to"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        'text-ink-muted min-w-0 w-full justify-start text-left [&>span]:w-full',
        className,
      )}
    >
      <Search className="text-ink-muted size-4 shrink-0" aria-hidden />
      {/* The visible word stays short beside the shortcut; the name says it all. */}
      <span className="min-w-0 truncate">Search</span>
      <Kbd className="desktop:inline-flex ms-auto hidden">{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
    </Button>
  );
}

/**
 * CommandPalette — ⌘K / Ctrl+K navigation for the authed shell.
 *
 * Keyboard-first velocity is the point: every nav destination and every
 * project in the workspace is reachable without leaving the home row. The
 * top-bar search is the pointer affordance for the same thing.
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
export function CommandPalette({
  destinations,
}: Readonly<{
  /** The shell's destinations by group; a managed plan may list fewer. */
  destinations: (options: { managed: boolean }) => readonly PaletteGroup[];
}>) {
  const router = useNavigate();
  const { projects, activeProjectId, activeWorkspaceId } = useProjectContext();
  const managed = useManagedPlan();
  const selectProject = useSelectProject();
  const { open, setOpen, query, setQuery, active, setActive, restoreFocus, setOpenState } =
    useCommandPaletteOpen();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const navigation = destinations({ managed }).flatMap((group) =>
      group.items.map((item) => {
        const href = scopedNavigationDestination(
          item.href,
          item.scope,
          activeProjectId,
          activeWorkspaceId,
        );
        return {
          id: `nav:${item.href}`,
          label: item.label,
          group: group.title,
          icon: item.icon,
          href,
          run: () => router(href),
        };
      }),
    );

    // Switching project re-scopes the API client's workspace header, so this
    // is a genuine action rather than a link.
    const projectCommands = projects.map((project) => ({
      id: `project:${project.id}`,
      // brand_name is required by projectSchema, so there is no fallback to
      // guard here; ProjectSwitcher shows the same label.
      label: project.brand_name,
      group: 'Switch project',
      logoUrl: project.brand?.logo_url,
      hint: project.id === activeProjectId ? 'Current' : undefined,
      run: () => selectProject(project.id),
    }));

    return [...navigation, ...projectCommands];
  }, [router, projects, activeProjectId, activeWorkspaceId, selectProject, managed, destinations]);

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

  // Highlighting a destination is the palette's pointer or keyboard intent:
  // it warms the route's code and primary read, as hovering a nav link does.
  const onIntent = useRouteIntent();
  function highlight(index: number) {
    if (index === activeIndex) return;
    setActive(index);
    const href = results[index]?.href;
    if (href) onIntent(href);
  }

  const runCommand = useCallback(
    (command: Command | undefined) => {
      if (!command) return;
      setOpen(false);
      command.run();
    },
    [setOpen],
  );

  // Movement is relative to the CLAMPED index, so wrapping stays correct even
  // on the render right after a filter shrank the list.
  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlight((activeIndex + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlight((activeIndex - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runCommand(results[activeIndex]);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpenState}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-scrim z-overlay fixed inset-0" />
        <DialogPrimitive.Content
          // Radix requires a Title for the dialog's accessible name and
          // warns when one is absent. The palette has no visible heading —
          // its input is the header — so the title is screen-reader only.
          // `aria-describedby={undefined}` opts out of the description Radix
          // otherwise looks for, which this dialog deliberately lacks.
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
          className={cn(
            FLOAT_FACE,
            'dialog-panel z-modal fixed top-16 left-1/2 flex max-h-[calc(100dvh-8rem)] w-[calc(100vw-3rem)] max-w-160 -translate-x-1/2 flex-col overflow-hidden overscroll-contain rounded-lg',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          {/* The search row is the dialog's header: the open dialog is the
              focus context, so its divider stays the soft `line` rule. */}
          <div className="palette-field border-line text-ink-muted flex h-[var(--control-lg)] shrink-0 items-center gap-3 border-b px-4">
            <Search className="size-4 shrink-0" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search or jump to…"
              role="combobox"
              aria-label="Search commands"
              aria-expanded={results.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                results[activeIndex] ? `${listboxId}-${results[activeIndex].id}` : undefined
              }
              className="text-body-sm text-ink placeholder:text-ink-muted h-full min-w-0 flex-1 bg-transparent"
            />
            <Kbd>Esc</Kbd>
          </div>

          <CommandPaletteResults
            results={results}
            query={query}
            activeIndex={activeIndex}
            listboxId={listboxId}
            listRef={listRef}
            highlight={highlight}
            runCommand={runCommand}
          />

          {/* Keyboard legend — the palette is a keyboard surface first, so
                it states its own controls rather than assuming they are known. */}
          <div className="border-line text-ink-muted text-caption flex shrink-0 items-center gap-4 border-t px-4 py-2">
            <span className="inline-flex items-center gap-2">
              <Kbd keys={['↑', '↓']} />
              {'navigate'}
            </span>
            <span className="inline-flex items-center gap-2">
              <Kbd>↵</Kbd>
              {'select'}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
