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
 * link gets it on the clipboard first, and the strip announces where to paste it.
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

const isMouse = (event: PointerEvent) => event.pointerType === 'mouse';

/** A mouse over a menu item must not move focus there; keyboard focus still does. */
const keepFocus = (event: PointerEvent) => {
  if (isMouse(event)) event.preventDefault();
};

function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const hovered = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => cancelClose, []);
  return {
    open,
    /** Set while a hover opened the menu; a hover close leaves focus where it is. */
    hovered,
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
 * The one way to connect an assistant to CiteLadder: one Connect button that
 * opens Claude in a click, then the MCP URL with a copy control. Hovering the
 * button (or ArrowDown from it) offers the other assistants. Shared by
 * Settings and the public site.
 */
export function ConnectStrip({ className }: Readonly<{ className?: string }>) {
  const [primary, ...others] = MCP_CLIENT_LINKS;
  const menu = useHoverMenu();
  const link = useRef<HTMLAnchorElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const select = (client: McpClientLink) => {
    void handOff(client).then(setNotice);
  };

  return (
    <section
      aria-label="Connect CiteLadder to an AI assistant"
      className={cn(
        'bg-panel surface-card flex w-fit max-w-full flex-wrap items-center gap-3 rounded-[var(--radius-card)] p-[var(--card-padding)]',
        className,
      )}
    >
      <Dropdown open={menu.open} onOpenChange={menu.setOpen} modal={false}>
        {/* The menu anchors on this wrapper, so the button keeps its face while it is open. */}
        <DropdownTrigger asChild>
          <span className="group inline-flex shrink-0">
            <Button asChild>
              <a
                ref={link}
                href={primary.href}
                target="_blank"
                rel="noopener noreferrer"
                data-marketing-cta=""
                onClick={() => select(primary)}
                onPointerEnter={menu.enter}
                onPointerLeave={menu.leave}
                // A press follows the link; only hover and ArrowDown or Space open the menu.
                onPointerDown={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  event.currentTarget.click();
                }}
              >
                Connect to {primary.label}
                <ChevronDown
                  className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </a>
            </Button>
          </span>
        </DropdownTrigger>
        <DropdownContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0"
          onPointerEnter={menu.enter}
          onPointerLeave={menu.leave}
          onCloseAutoFocus={(event) => {
            // The wrapper cannot take focus, so a keyboard close returns it to the link.
            event.preventDefault();
            if (!menu.hovered.current) link.current?.focus();
          }}
        >
          {others.map((client) => (
            <DropdownItem
              key={client.id}
              asChild
              // A pointer highlights with the hover fill alone; moving focus would ring the item.
              onPointerMove={keepFocus}
              onPointerLeave={keepFocus}
              onSelect={() => select(client)}
            >
              <a href={client.href} target="_blank" rel="noopener noreferrer" data-marketing-cta="">
                <span className="flex-1">{client.label}</span>
                <ExternalLink className="size-4 shrink-0" aria-hidden />
              </a>
            </DropdownItem>
          ))}
        </DropdownContent>
      </Dropdown>
      <div className="flex min-w-0 items-center gap-2">
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
      {/* Read out, not shown: the assistant's own page is where the person pastes. */}
      <output className="sr-only">{notice}</output>
    </section>
  );
}
