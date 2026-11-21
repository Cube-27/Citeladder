import { useEffect, useState, useSyncExternalStore, type ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import type { CommandPalette, PaletteLaunch } from '@/components/ui/command-palette';
import { Kbd } from '@/components/ui/kbd';
import { MASTHEAD_LABELLED } from '@/components/ui/masthead';
import { Search } from '@/lib/icons';
import { reportClientError } from '@/lib/client-errors';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/lib/navigation/shell-events';
import { cn } from '@/lib/utils';

function subscribeToPlatform() {
  return () => {};
}

function isMacPlatform() {
  return /Mac/i.test(navigator.platform);
}

type CommandPaletteLaunch = { trigger: HTMLElement };

/** The masthead's search trigger: where focus returns when the palette was opened from nowhere. */
export const PALETTE_LAUNCHER = '[data-palette-launcher]';

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
      data-palette-launcher=""
      aria-label="Search or jump to"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn('text-ink-2 text-left', MASTHEAD_LABELLED, className)}
    >
      <Search className="text-ink-2 size-4 shrink-0" aria-hidden />
      {/* The visible word stays short beside the shortcut; the name says it all. */}
      <span className="min-w-0 truncate">Search</span>
      <Kbd className="shell:inline-flex hidden">{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
    </Button>
  );
}

const isPaletteShortcut = (event: KeyboardEvent) =>
  (event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === 'k';

/**
 * The command palette, loaded on its first open so it stays out of the eager
 * bundle. ⌘K / Ctrl+K and the search trigger work from first paint: the first
 * one loads the palette, which mounts open with focus in its field and later
 * returns focus to where the reader was. From then on the palette listens
 * itself. A failed load is reported and the next press tries again.
 */
export function CommandPaletteHost(props: Omit<ComponentProps<typeof CommandPalette>, 'launch'>) {
  const [loaded, setLoaded] = useState<{
    Palette: typeof CommandPalette;
    launch: PaletteLaunch;
  } | null>(null);
  useEffect(() => {
    if (loaded) return;
    let loading = false;
    const load = (returnTo: HTMLElement | null) => {
      if (loading) return;
      loading = true;
      import('@/components/ui/command-palette').then(
        ({ CommandPalette: Palette }) => setLoaded({ Palette, launch: { returnTo } }),
        (error: unknown) => {
          loading = false;
          reportClientError({ kind: 'chunk_load', error });
        },
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      const active = document.activeElement;
      load(active instanceof HTMLElement ? active : null);
    };
    const onLaunch = (event: Event) => {
      const trigger: unknown = event instanceof CustomEvent ? event.detail?.trigger : null;
      load(trigger instanceof HTMLElement ? trigger : null);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onLaunch);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onLaunch);
    };
  }, [loaded]);
  return loaded ? <loaded.Palette {...props} launch={loaded.launch} /> : null;
}
