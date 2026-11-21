import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { Menu, MenuContent, MenuLinkItem, MenuTrigger } from '@/components/ui/menu';
import { CodeToken, textRole } from '@/components/ui/typography';
import { ChevronDown, ExternalLink } from '@/lib/icons';
import { MCP_CLIENT_LINKS, MCP_SERVER_URL, type McpClientLink } from '@/lib/config/mcp-clients';
import { cn } from '@/lib/utils';
import { slipClasses } from '@/components/ui/slip';

const HOVER_CLOSE_DELAY_MS = 160;

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
      closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
    },
  };
}

export function ConnectStrip({
  surface = 'website',
}: Readonly<{
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
      className={cn(!inApp && slipClasses(), 'w-fit max-w-full flex-wrap')}
    >
      <Menu open={menu.open} onOpenChange={menu.setOpen} modal={false}>
        <MenuTrigger asChild>
          <span className="group inline-flex shrink-0">
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
                aria-haspopup="menu"
                aria-expanded={menu.open}
                onPointerEnter={menu.enter}
                onPointerLeave={menu.leave}
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
            event.preventDefault();
            if (!menu.hovered.current) link.current?.focus();
          }}
        >
          {others.map((client) => (
            <MenuLinkItem
              key={client.id}
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
      <output className="sr-only">{notice}</output>
    </Inline>
  );
}
