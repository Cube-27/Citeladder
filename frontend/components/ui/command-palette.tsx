import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { BrandMark } from '@/components/ui/brand-mark';
import { Kbd } from '@/components/ui/kbd';
import { useProjectContext } from '@/lib/project/project-context';
import { useManagedPlan } from '@/lib/billing/entitlement-context';
import {
  scopedNavigationDestination,
  useSelectProject,
} from '@/lib/navigation/project-destination';
import { PALETTE_LAUNCHER } from '@/components/ui/command-palette-launcher';
import { returnTargetFor, SCRIM } from '@/components/ui/dialog';
import { pluralCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/lib/navigation/shell-events';
import { useRouteIntent } from '@/lib/navigation/use-route-intent';
import { SHEET_FACE } from '@/components/ui/slip';

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

/**
 * CommandPalette — ⌘K / Ctrl+K navigation for the authed shell: the
 * sidebar's groups in the same order with the same labels, the workspace and
 * account pages, then "Switch project".
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
type Command = {
  id: string;
  label: string;
  group: string;
  /** Nav destinations carry their canonical glyph; projects render a brand logo. */
  icon?: LucideIcon;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  hint?: string;
  /** A destination's address, warmed when its row is highlighted. */
  href?: string;
  run: () => void;
};

/**
 * Results keep ONE flat order for the keyboard cursor, but render grouped.
 * Rebuilding sections from that flat list (rather than grouping first and
 * flattening for keys) is what keeps the highlighted row and the Enter target
 * the same element — the two orders can never drift apart.
 */
function toSections(results: readonly Command[]) {
  const sections: { group: string; rows: { command: Command; index: number }[] }[] = [];
  results.forEach((command, index) => {
    const last = sections.at(-1);
    if (last?.group === command.group) last.rows.push({ command, index });
    else sections.push({ group: command.group, rows: [{ command, index }] });
  });
  return sections;
}

/** How the palette was first opened, by the launcher that loaded it. */
export type PaletteLaunch = Readonly<{ returnTo: HTMLElement | null }>;

export function CommandPalette({
  destinations,
  launch,
}: Readonly<{
  /** The shell's destinations by group; a managed plan may list fewer. */
  destinations: (options: { managed: boolean }) => readonly PaletteGroup[];
  /** Mounts the palette open, returning focus to `returnTo` when it closes. */
  launch?: PaletteLaunch;
}>) {
  const router = useNavigate();
  const { projects, activeProjectId, activeWorkspaceId } = useProjectContext();
  const managed = useManagedPlan();
  const selectProject = useSelectProject();
  const [open, setOpen] = useState(launch !== undefined);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Where focus goes when the palette closes. Radix restores focus to its own
  // Trigger, but the ⌘K path has no trigger, so without this the caller loses
  // their place in the page and focus falls back to <body>.
  const returnFocusTo = useRef<HTMLElement | null>(launch?.returnTo ?? null);

  const restoreFocus = useCallback(() => {
    const target = returnFocusTo.current;
    returnFocusTo.current = null;
    // The element may have unmounted while the palette was open (switching
    // project re-renders the shell), or be folded behind More. Opened from
    // <body> or from a vanished element, focus goes to the masthead's search.
    const opener = target === document.body ? null : returnTargetFor(target);
    (opener ?? returnTargetFor(document.querySelector<HTMLElement>(PALETTE_LAUNCHER)))?.focus();
  }, []);

  // Opening resets the palette. Done in the handler, not an effect — the reset
  // is caused by the interaction, not by state outside React.
  const setOpenState = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery('');
      setActive(0);
    }
  }, []);

  const openFromTrigger = useCallback(
    (trigger: HTMLElement) => {
      returnFocusTo.current = trigger;
      setOpenState(true);
    },
    [setOpenState],
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const trigger: unknown = event instanceof CustomEvent ? event.detail?.trigger : null;
      if (trigger instanceof HTMLElement) openFromTrigger(trigger);
    };
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
  }, [openFromTrigger]);

  // ⌘K / Ctrl+K toggles from anywhere. Bound on keydown so it beats the
  // browser's own find-in-page on the platforms that map ⌘K.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Modifier first, then `key`. This handler runs on EVERY keystroke in the
      // app, so the cheap test should gate the string work — and `event.key` is
      // optional on a programmatically constructed KeyboardEvent (browser
      // extensions and IMEs dispatch these), where reading `.toLowerCase()` off
      // it threw "Cannot read properties of undefined".
      if (!(event.metaKey || event.ctrlKey) || event.key?.toLowerCase() !== 'k') return;
      event.preventDefault();
      if (open) {
        setOpen(false);
        return;
      }

      // Capture the caller's position before the dialog steals focus.
      const activeEl = document.activeElement;
      returnFocusTo.current = activeEl instanceof HTMLElement ? activeEl : null;
      setQuery('');
      setActive(0);
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

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

    // Projects come last, after every destination. Switching project re-scopes the API client's workspace header, so this
    // is a genuine action rather than a link.
    const projectCommands = projects.map((project) => ({
      id: `project:${project.id}`,
      // brand_name is required by projectSchema, so there is no fallback to
      // guard here; ProjectSwitcher shows the same label.
      label: project.brand_name,
      group: 'Switch project',
      logoUrl: project.brand?.logo_url,
      websiteUrl: project.website_url,
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
        <DialogPrimitive.Overlay className={cn('dialog-overlay', SCRIM)} />
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
            SHEET_FACE,
            'dialog-panel z-modal fixed top-16 left-1/2 flex max-h-[calc(100dvh-8rem)] w-[calc(100vw-3rem)] max-w-160 -translate-x-1/2 flex-col overflow-hidden overscroll-contain rounded-overlay',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          {/* The search row is the dialog's header. It opens with the caret
              only and draws the ring when Tab returns to the field
              (globals.css, `palette-field`). */}
          <div className="palette-field border-rule text-ink-2 flex min-h-[var(--control-lg)] shrink-0 items-center gap-3 border-b px-4">
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
              className="type-body text-ink placeholder:text-ink-2 min-w-0 flex-1 self-stretch bg-transparent"
            />
            <Kbd>Esc</Kbd>
          </div>
          <output className="sr-only">
            {query.trim() ? paletteOutcome(results.length, query) : ''}
          </output>

          <div
            ref={listRef}
            className="content-scroll max-h-100 min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {/* The empty state is a message, not an option, so it sits
                  beside the listbox rather than inside it. */}
            {results.length === 0 ? (
              <p className="type-body text-ink-2 px-4 py-[var(--page-section-gap)] text-center">
                {`No matches for “${query}”`}
              </p>
            ) : null}
            <div
              id={listboxId}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Command results are an active-descendant popup; native select/datalist cannot contain grouped action buttons.
              role="listbox"
              aria-label="Commands"
            >
              {toSections(results).map((section, sectionIndex) => {
                const headingId = `${listboxId}-group-${sectionIndex}`;
                return (
                  <div
                    key={section.group}
                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A listbox may only own options and groups; fieldset is not a permitted child.
                    role="group"
                    aria-labelledby={headingId}
                    className="[&+&]:mt-2"
                  >
                    <p id={headingId} className="type-caption-strong px-2 py-1">
                      {section.group}
                    </p>
                    {section.rows.map(({ command, index }) => {
                      const isActive = index === activeIndex;
                      const Icon = command.icon;
                      return (
                        <button
                          key={command.id}
                          id={`${listboxId}-${command.id}`}
                          type="button"
                          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Focus stays on the palette input while these action options are active descendants.
                          role="option"
                          // Options are reached through the input's active
                          // descendant, never by Tab.
                          tabIndex={-1}
                          aria-selected={isActive}
                          data-active={isActive}
                          onMouseMove={() => highlight(index)}
                          onClick={() => runCommand(command)}
                          className={cn(
                            'press [--press:0.98] type-body text-ink flex min-h-[var(--control-md)] w-full items-center gap-2 rounded-mark px-2 text-left',
                            isActive && 'overlay-hover',
                          )}
                        >
                          {Icon ? (
                            <Icon className="text-ink-2 size-4 shrink-0" aria-hidden />
                          ) : (
                            <BrandMark
                              name={command.label}
                              logoUrl={command.logoUrl}
                              websiteUrl={command.websiteUrl}
                              placement="inline"
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate">{command.label}</span>
                          {command.hint ? (
                            <span className="type-caption text-ink-2 shrink-0 whitespace-nowrap">
                              {command.hint}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Keyboard legend — the palette is a keyboard surface first, so
                it states its own controls rather than assuming they are known. */}
          <div className="border-rule type-caption text-ink-2 flex shrink-0 items-center gap-4 border-t px-4 py-2">
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

/** What a search found, for assistive technology as the reader types. */
function paletteOutcome(count: number, query: string) {
  return count === 0 ? `No matches for “${query}”` : pluralCount(count, 'result');
}
