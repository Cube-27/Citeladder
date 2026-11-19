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
import { NAV_DROPS, NAV_LINKS, type NavDrop } from '@/lib/marketing-content/nav';

import { MegaMenu } from './mega-menu';
import { inSection } from './site-nav';
import './site-nav.css';

/**
 * Hover intent: a resting pointer opens the first menu after this
 * long, and a neighbouring trigger switches at once for this long after a
 * menu closes, so sweeping across the bar neither flashes nor stalls.
 */
const OPEN_DELAY_MS = 50;
const SKIP_DELAY_MS = 100;

/** Where the hover pill sits, and whether it slides there or jumps. */
type Pill = Readonly<{ x: number; width: number; visible: boolean; jump: boolean }>;

const HIDDEN_PILL: Pill = { x: 0, width: 0, visible: false, jump: true };

/** The pill keeps one layout width and scales to its trigger, so it moves by transform alone. */
const PILL_BASE_WIDTH = 100;

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
 * A menu is current on its own section, on any page it lists and on the
 * sections it names, so a guide at the site root (/open-source) or a study
 * page (/ai-crawlers/gptbot) still marks Resources.
 */
function dropCurrent(path: string, drop: NavDrop): boolean {
  return (
    inSection(path, drop.href) ||
    (drop.key === 'resources' && drop.sections.some((section) => inSection(path, section))) ||
    drop.groups.some((group) =>
      group.items.some(
        (item) => !('external' in item && item.external) && inSection(path, item.href),
      ),
    )
  );
}

/**
 * Where the popup hangs: its x offset from the trigger row, whether it slides
 * there, and the x of its trigger's centre, which it scales from.
 */
type Stage = Readonly<{ shift: number; slide: boolean; origin: number }>;

/**
 * The popup's x offset: a multi-column menu (Platform, Resources)
 * starts at the navbar's own left edge; a one-column menu (Solutions) hangs
 * from the trigger row. The root's offsetLeft is its distance from the bar.
 */
function stageShift(key: string, root: HTMLElement | null): number {
  const drop = NAV_DROPS.find((candidate) => candidate.key === key);
  if (!drop || drop.groups.length < 2 || !root) return 0;
  return -root.offsetLeft;
}

/**
 * The website navbar's desktop menus: one Radix NavigationMenu whose
 * menus all render into a single shared popup under the whole bar. Moving
 * between triggers keeps the popup open; its height follows the open menu
 * and the menus crossfade. Enterprise and Pricing are plain links in the
 * same list, so the arrow keys move across every item.
 *
 * Below 960px the bar hides this and the server-rendered sheet takes over.
 */
export function DesktopNav({ path }: Readonly<{ path: string }>) {
  const [value, setValue] = useState('');
  const { pill, showAt, hide } = usePill();
  const [stage, setStage] = useState<Stage>({ shift: 0, slide: false, origin: 0 });
  const root = useRef<HTMLDivElement>(null);
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
    // A closing popup stays where it is; an opening one jumps into place,
    // and switching between open menus slides with the morph.
    const trigger = triggers.current.get(next);
    if (next !== '') {
      const shift = stageShift(next, root.current);
      const centre = trigger ? trigger.offsetLeft + trigger.offsetWidth / 2 : 0;
      setStage({ shift, slide: value !== '', origin: centre - shift });
    }
    setValue(next);
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
      <div ref={root} className="cl-navmenu">
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
            style={{
              width: PILL_BASE_WIDTH,
              transform: `translateX(${pill.x}px) scaleX(${pill.width / PILL_BASE_WIDTH})`,
            }}
          />
          {NAV_DROPS.map((drop) => (
            <Item key={drop.key} value={drop.key}>
              <Trigger
                ref={(node) => {
                  if (node) triggers.current.set(drop.key, node);
                }}
                className="cl-navbar-link focus-ring"
                data-current={dropCurrent(path, drop) ? '' : undefined}
                onPointerEnter={(event) => {
                  // Only a mouse hover-opens (as in Radix), so only a mouse
                  // arriving starts a new hover; a tap enters on every touch.
                  if (event.pointerType === 'mouse') pinned.current = null;
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
        {/* Hangs under the bar, not under its trigger: from the trigger row, or
            from the bar's left edge for a multi-column menu. */}
        <div
          className="cl-navmenu-stage"
          data-slide={stage.slide ? '' : undefined}
          style={{ transform: `translateX(${stage.shift}px)` }}
        >
          <Viewport
            className="cl-navmenu-viewport"
            style={{ transformOrigin: `${stage.origin}px 0` }}
          />
        </div>
      </div>
    </Root>
  );
}
