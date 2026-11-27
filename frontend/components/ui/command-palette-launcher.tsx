import { useEffect, useState, useSyncExternalStore, type ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import type { CommandPalette, PaletteLaunch } from '@/components/ui/command-palette';
import { Kbd } from '@/components/ui/kbd';
import { Search } from '@/lib/icons';
import { reportClientError } from '@/lib/client-errors';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/lib/navigation/shell-events';
import { Icon } from '@/components/ui/icon';

function subscribeToPlatform() {
  return () => {};
}

function isMacPlatform() {
  return /Mac/i.test(navigator.platform);
}

type CommandPaletteLaunch = { trigger: HTMLElement };

export const PALETTE_LAUNCHER = '[data-palette-launcher]';

export function CommandPaletteTrigger({
  onOpen,
}: Readonly<{
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
      look="launcher"
    >
      <Icon icon={Search} size="flush" tone="ink-2" />
      <span className="min-w-0 truncate">Search</span>
      <Kbd className="shell:inline-flex hidden">{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
    </Button>
  );
}

const isPaletteShortcut = (event: KeyboardEvent) =>
  (event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === 'k';

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
