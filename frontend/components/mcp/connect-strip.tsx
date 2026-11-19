import { ChevronDown, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { Menu, MenuContent, MenuLinkItem, MenuTrigger } from '@/components/ui/menu';
import { CodeToken, textRole } from '@/components/ui/typography';
import { MCP_CLIENT_LINKS, MCP_SERVER_URL, type McpClientLink } from '@/lib/config/mcp-clients';
import { cn } from '@/lib/utils';
import { slipClasses } from '@/components/ui/slip';

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
export function ConnectStrip({
  surface = 'website',
}: Readonly<{
  /** In the app the strip sits in a page body, so it takes no primary (3.1). */
  surface?: 'website' | 'app';
}>) {
  const inApp = surface === 'app';
  const [primary, ...others] = MCP_CLIENT_LINKS;
  const menu = useHoverMenu();
  const link = useRef<HTMLAnchorElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const select = (client: McpClientLink) => {
    void handOff(client).then(setNotice);
  };

  return (
    <Inline
      as="section"
      gap="compact"
      aria-label="Connect CiteLadder to an AI assistant"
      // In the app the strip sits on the page surface; the website keeps it in a slip.
      className={cn(!inApp && slipClasses(), 'w-fit max-w-full flex-wrap')}
    >
      <Menu open={menu.open} onOpenChange={menu.setOpen} modal={false}>
        {/* The menu anchors on this wrapper, so the button keeps its face while it is open. */}
        <MenuTrigger asChild>
          <span className="group inline-flex shrink-0">
            {/* On the website both buttons take the page's call-to-action height. */}
            <Button
              asChild
              variant={inApp ? 'secondary' : 'primary'}
              className={cn(!inApp && 'marketing-cta-button')}
            >
              <a
                ref={link}
                href={primary.href}
                target="_blank"
                rel="noopener noreferrer"
                data-marketing-cta=""
                onClick={() => select(primary)}
                // The wrapper anchors the menu, but this link is what takes focus.
                aria-haspopup="menu"
                aria-expanded={menu.open}
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
                <Icon
                  icon={ChevronDown}
                  className="transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                />
              </a>
            </Button>
          </span>
        </MenuTrigger>
        <MenuContent
          align="start"
          onPointerEnter={menu.enter}
          onPointerLeave={menu.leave}
          onCloseAutoFocus={(event) => {
            // The wrapper cannot take focus, so a keyboard close returns it to the link.
            event.preventDefault();
            if (!menu.hovered.current) link.current?.focus();
          }}
        >
          {others.map((client) => (
            <MenuLinkItem
              key={client.id}
              // A pointer highlights with the hover fill alone; moving focus would ring the item.
              onPointerMove={keepFocus}
              onPointerLeave={keepFocus}
              onSelect={() => select(client)}
            >
              <a href={client.href} target="_blank" rel="noopener noreferrer" data-marketing-cta="">
                <span className="flex-1">{client.label}</span>
                <Icon icon={ExternalLink} />
              </a>
            </MenuLinkItem>
          ))}
        </MenuContent>
      </Menu>
      <Inline>
        <span className={textRole('body', 'text-ink-2 shrink-0')}>MCP URL</span>
        <CodeToken>{MCP_SERVER_URL}</CodeToken>
        <CopyButton
          value={MCP_SERVER_URL}
          variant={inApp ? 'secondary' : 'quiet'}
          className={cn(!inApp && 'marketing-cta-button')}
          copiedLabel="MCP URL copied"
        >
          Copy
        </CopyButton>
      </Inline>
      {/* Read out, not shown: the assistant's own page is where the person pastes. */}
      <output className="sr-only">{notice}</output>
    </Inline>
  );
}
