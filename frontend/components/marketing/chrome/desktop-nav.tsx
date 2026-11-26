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
import { ChevronDown } from '@/lib/icons';
import { NAV_DROPS, NAV_LINKS, type NavDrop } from '@/lib/marketing-content/nav';

import { MegaMenu } from './mega-menu';
import { inSection } from './site-nav';
import './site-nav.css';

const OPEN_DELAY_MS = 50;
const SKIP_DELAY_MS = 100;

type Pill = Readonly<{ x: number; width: number; visible: boolean; jump: boolean }>;

const HIDDEN_PILL: Pill = { x: 0, width: 0, visible: false, jump: true };

const PILL_BASE_WIDTH = 100;

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

function dropCurrent(path: string, drop: NavDrop): boolean {
  return (
    (drop.key !== 'platform' && inSection(path, drop.href)) ||
    (drop.key === 'resources' && drop.sections.some((section) => inSection(path, section))) ||
    drop.groups.some((group) =>
      group.items.some(
        (item) => !('external' in item && item.external) && inSection(path, item.href),
      ),
    )
  );
}

type Stage = Readonly<{ shift: number; slide: boolean; origin: number }>;

function stageShift(key: string, root: HTMLElement | null): number {
  const drop = NAV_DROPS.find((candidate) => candidate.key === key);
  if (!drop || drop.groups.length < 2 || !root) return 0;
  return -root.offsetLeft;
}

export function DesktopNav({ path }: Readonly<{ path: string }>) {
  const [value, setValue] = useState('');
  const { pill, showAt, hide } = usePill();
  const [stage, setStage] = useState<Stage>({ shift: 0, slide: false, origin: 0 });
  const root = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<string, HTMLElement>());
  const hovering = useRef(false);
  const pinned = useRef<string | null>(null);

  const onTriggerClick = (key: string, event: MouseEvent) => {
    const open = value === key;
    if (open && pinned.current !== key) event.preventDefault();
    pinned.current = open && pinned.current === key ? null : key;
  };

  const onValueChange = (next: string) => {
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
              '--pill-base': `${PILL_BASE_WIDTH}px`,
              '--pill-x': `${pill.x}px`,
              '--pill-scale': pill.width / PILL_BASE_WIDTH,
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
        <div
          className="cl-navmenu-stage"
          data-slide={stage.slide ? '' : undefined}
          style={{
            '--stage-shift': `${stage.shift}px`,
            '--stage-origin': `${stage.origin}px`,
          }}
        >
          <Viewport className="cl-navmenu-viewport" />
        </div>
      </div>
    </Root>
  );
}
