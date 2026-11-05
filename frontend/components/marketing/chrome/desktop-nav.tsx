import { ChevronDown } from 'lucide-react';
import { useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from 'react';

import {
  NavigationMenu as Root,
  NavigationMenuContent as Content,
  NavigationMenuItem as Item,
  NavigationMenuLink as Link,
  NavigationMenuList as List,
  NavigationMenuTrigger as Trigger,
  NavigationMenuViewport as Viewport,
} from '@/components/ui/navigation-menu';
import { NAV_DROPS, NAV_LINKS } from '@/lib/marketing-content/nav';

import { MegaMenu } from './mega-menu';
import { inSection } from './site-nav';

/**
 * Hover intent (D22): a resting pointer opens the first menu after this
 * long, and a neighbouring trigger switches at once for this long after a
 * menu closes, so sweeping across the bar neither flashes nor stalls.
 */
const OPEN_DELAY_MS = 50;
const SKIP_DELAY_MS = 100;

/** Where the hover pill sits, and whether it slides there or jumps. */
type Pill = Readonly<{ x: number; width: number; visible: boolean; jump: boolean }>;

const HIDDEN_PILL: Pill = { x: 0, width: 0, visible: false, jump: true };

/**
 * The pill under the hovered or focused trigger. It slides between
 * triggers, but its first appearance jumps into place rather than sliding in
 * from the left edge.
 */
function usePill() {
  const [pill, setPill] = useState<Pill>(HIDDEN_PILL);
  const showAt = (element: HTMLElement) =>
    setPill((current) => ({
      x: element.offsetLeft,
      width: element.offsetWidth,
      visible: true,
      jump: !current.visible,
    }));
  const hide = () => setPill((current) => ({ ...current, visible: false }));
  return { pill, showAt, hide };
}

/**
 * The website navbar's desktop menus (D22): one Radix NavigationMenu whose
 * menus all render into a single shared popup under the whole bar. Moving
 * between triggers keeps the popup open; its height follows the open menu
 * and the menus crossfade. Enterprise and Pricing are plain links in the
 * same list, so the arrow keys move across every item.
 *
 * Below 1280px the bar hides this and the server-rendered sheet takes over.
 */
export function DesktopNav({ path }: Readonly<{ path: string }>) {
  const [value, setValue] = useState('');
  const { pill, showAt, hide } = usePill();
  const triggers = useRef(new Map<string, HTMLElement>());
  const hovering = useRef(false);
  /**
   * The menu a click has pinned. A resting pointer opens a menu within
   * 50ms, so a click that follows a hover is meant to open, not close: it
   * pins the menu instead, and only a second click closes it.
   */
  const pinned = useRef<string | null>(null);

  const onTriggerClick = (key: string, event: MouseEvent) => {
    const open = value === key;
    if (open && pinned.current !== key) event.preventDefault();
    pinned.current = open && pinned.current === key ? null : key;
  };

  const onValueChange = (next: string) => {
    setValue(next);
    const trigger = triggers.current.get(next);
    if (trigger) showAt(trigger);
    else if (!hovering.current) hide();
  };
  const onItemEnter = (event: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>) =>
    showAt(event.currentTarget);
  const onListLeave = () => {
    hovering.current = false;
    const trigger = triggers.current.get(value);
    if (trigger) showAt(trigger);
    else hide();
  };
  const onListBlur = (event: FocusEvent<HTMLUListElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (!hovering.current && value === '') hide();
  };

  return (
    // The root is a plain div: the enclosing <nav> is already the landmark.
    <Root
      asChild
      aria-label={undefined}
      value={value}
      onValueChange={onValueChange}
      delayDuration={OPEN_DELAY_MS}
      skipDelayDuration={SKIP_DELAY_MS}
    >
      <div className="cl-navmenu">
        <List
          className="cl-navmenu-list"
          onPointerEnter={() => {
            hovering.current = true;
          }}
          onPointerLeave={onListLeave}
          onBlur={onListBlur}
        >
          <li
            aria-hidden="true"
            className="cl-navmenu-pill"
            data-visible={pill.visible ? '' : undefined}
            data-jump={pill.jump ? '' : undefined}
            style={{ width: pill.width, transform: `translateX(${pill.x}px)` }}
          />
          {NAV_DROPS.map((drop) => (
            <Item key={drop.key} value={drop.key}>
              <Trigger
                ref={(node) => {
                  if (node) triggers.current.set(drop.key, node);
                }}
                className="cl-navbar-link focus-ring"
                data-current={inSection(path, drop.href) ? '' : undefined}
                onPointerEnter={(event) => {
                  pinned.current = null;
                  onItemEnter(event);
                }}
                onFocus={onItemEnter}
                onClick={(event) => onTriggerClick(drop.key, event)}
              >
                {drop.label}
                <ChevronDown aria-hidden className="cl-navbar-caret size-4" />
              </Trigger>
              <Content className="cl-navmenu-content">
                <MegaMenu drop={drop} path={path} />
              </Content>
            </Item>
          ))}
          {NAV_LINKS.map(({ label, href }) => (
            <Item key={href}>
              <Link asChild active={path === href}>
                <a
                  href={href}
                  className="cl-navbar-link focus-ring"
                  onPointerEnter={onItemEnter}
                  onFocus={onItemEnter}
                >
                  {label}
                </a>
              </Link>
            </Item>
          ))}
        </List>
        {/* Hangs under the whole bar (D19's width), not under its trigger. */}
        <div className="cl-navmenu-stage">
          <Viewport className="cl-navmenu-viewport" />
        </div>
      </div>
    </Root>
  );
}
