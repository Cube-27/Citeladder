'use client';

import { ChevronDown, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { textRole } from '@/components/ui/typography';
import { MCP_CLIENT_LINKS, MCP_SERVER_URL, type McpClientLink } from '@/lib/config/mcp-clients';
import { cn } from '@/lib/utils';

/** Hover intent: long enough to cross from the button into the portalled menu. */
const HOVER_CLOSE_DELAY_MS = 160;

/**
 * Open the assistant in a new tab. A page that cannot take the URL from the
 * link gets it on the clipboard first, and the strip says where to paste it.
 */
async function handOff(client: McpClientLink): Promise<string | null> {
  if (client.handoff === 'prefilled') return null;
  try {
    await navigator.clipboard.writeText(MCP_SERVER_URL);
    return `URL copied. In ${client.label}, add a custom connector and paste it.`;
  } catch {
    return `In ${client.label}, add a custom connector with ${MCP_SERVER_URL}.`;
  }
}

function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const hovered = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => cancelClose, []);
  const isMouse = (event: PointerEvent) => event.pointerType === 'mouse';
  return {
    open,
    /** Opened by hover, so closing must not pull focus back to the trigger. */
    hovered,
    /** The menu's own open and close (keyboard, click, Escape) restore focus as usual. */
    setOpen: (next: boolean) => {
      cancelClose();
      hovered.current = false;
      setOpen(next);
    },
    enter: (event: PointerEvent) => {
      if (!isMouse(event)) return;
      cancelClose();
      if (!open) hovered.current = true;
      setOpen(true);
    },
    leave: (event: PointerEvent) => {
      if (!isMouse(event) || !hovered.current) return;
      cancelClose();
      // `hovered` stays set until the next open, so the close keeps focus where it is.
      closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
    },
  };
}

/**
 * The one way to connect an assistant to CiteLadder: Connect, which opens
 * Claude, then the MCP URL with a copy control. Hovering Connect or its chevron
 * offers the other assistants. Shared by Settings and the public site.
 */
export function ConnectStrip({ className }: Readonly<{ className?: string }>) {
  const [primary, ...others] = MCP_CLIENT_LINKS;
  const menu = useHoverMenu();
  const [notice, setNotice] = useState<string | null>(null);
  const select = (client: McpClientLink) => {
    void handOff(client).then(setNotice);
  };

  return (
    <section
      aria-label="Connect CiteLadder to an AI assistant"
      className={cn(
        'bg-panel surface-card flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] p-[var(--card-padding)]',
        className,
      )}
    >
      <div className="flex shrink-0 gap-px" onPointerEnter={menu.enter} onPointerLeave={menu.leave}>
        <Button asChild>
          <a
            href={primary.href}
            target="_blank"
            rel="noopener noreferrer"
            data-marketing-cta=""
            onClick={() => select(primary)}
          >
            Connect to {primary.label}
          </a>
        </Button>
        <Dropdown open={menu.open} onOpenChange={menu.setOpen} modal={false}>
          <DropdownTrigger asChild>
            <Button size="icon" aria-label="Connect another assistant" className="group">
              <ChevronDown
                className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                aria-hidden
              />
            </Button>
          </DropdownTrigger>
          <DropdownContent
            align="end"
            className="w-48"
            onPointerEnter={menu.enter}
            onPointerLeave={menu.leave}
            onCloseAutoFocus={(event) => {
              if (menu.hovered.current) event.preventDefault();
            }}
          >
            {others.map((client) => (
              <DropdownItem key={client.id} asChild onSelect={() => select(client)}>
                <a
                  href={client.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-marketing-cta=""
                >
                  <span className="flex-1">{client.label}</span>
                  <ExternalLink className="size-4 shrink-0" aria-hidden />
                </a>
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      </div>
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
        <span className={textRole('label', 'shrink-0')}>MCP URL</span>
        <code
          className={textRole(
            'emphasis',
            'bg-well min-w-0 truncate rounded-[var(--radius-xs)] px-2 py-1',
          )}
        >
          {MCP_SERVER_URL}
        </code>
        <CopyButton value={MCP_SERVER_URL} variant="ghost" size="sm" copiedLabel="MCP URL copied">
          Copy
        </CopyButton>
      </div>
      <output className={textRole('caption', 'basis-full empty:hidden')}>{notice}</output>
    </section>
  );
}
