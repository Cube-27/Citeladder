import { ArrowRight, ChevronDown } from 'lucide-react';
import { useContext, type RefObject } from 'react';

import {
  NAV_DROPS,
  NAV_LINKS,
  PLATFORM_OVERVIEW,
  type NavDropKey,
} from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

import type { OpenSource } from './nav';
import { NavItemLink, NavigationPath } from './nav-items';

const NAV_LINK =
  'nav-link website-nav relative inline-flex items-center gap-1 whitespace-nowrap ' +
  'rounded-[var(--radius-marketing-control)] px-3 py-2';

type DropLayout = Record<NavDropKey, { width: number }>;

type DesktopNavigationProps = {
  layout: DropLayout;
  panelLeft: number;
  openDrop: NavDropKey | null;
  openSource: OpenSource | null;
  linksRef: RefObject<HTMLDivElement | null>;
  clearDropClose: () => void;
  scheduleDropClose: () => void;
  closeDrop: () => void;
  /** Chosen a row or trigger: close and stay closed until pointer moves away. */
  selectDrop: (key?: NavDropKey) => void;
  releaseSuppression: (key?: NavDropKey) => void;
  openDropAt: (key: NavDropKey, trigger: HTMLElement, source?: OpenSource) => void;
};

/** Desktop links and the hover-intent dropdown panels they open. */
export function DesktopNavigation({
  layout,
  panelLeft,
  openDrop,
  openSource,
  linksRef,
  clearDropClose,
  scheduleDropClose,
  closeDrop,
  selectDrop,
  releaseSuppression,
  openDropAt,
}: Readonly<DesktopNavigationProps>) {
  const path = useContext(NavigationPath);
  return (
    <div
      ref={linksRef}
      className="relative hidden items-center lg:flex"
      onMouseEnter={clearDropClose}
      onMouseLeave={() => {
        // Leaving the nav is what re-arms hover after a selection.
        releaseSuppression();
        scheduleDropClose();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeDrop();
      }}
    >
      {NAV_DROPS.map(({ key, label, href }) => {
        const open = openDrop === key;
        return (
          <div
            key={key}
            className="flex items-center"
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') openDropAt(key, event.currentTarget);
            }}
            onMouseLeave={() => releaseSuppression(key)}
          >
            <button
              id={`desktop-nav-trigger-${key}`}
              type="button"
              className={NAV_LINK}
              data-open={open || undefined}
              data-current={path === href || path.startsWith(`${href}/`) || undefined}
              aria-expanded={open}
              aria-controls={`desktop-nav-panel-${key}`}
              onClick={(event) => {
                // A click on a hover-opened panel pins it open instead of closing it.
                if (open && openSource !== 'hover') closeDrop();
                else openDropAt(key, event.currentTarget, 'focus');
              }}
            >
              {label}
              <ChevronDown aria-hidden className="nav-chevron size-3.5" />
            </button>
            <DesktopDropPanel
              dropKey={key}
              hidden={!open}
              layout={layout}
              panelLeft={panelLeft}
              animate={openSource === 'hover'}
              clearDropClose={clearDropClose}
              selectDrop={selectDrop}
            />
          </div>
        );
      })}

      {NAV_LINKS.map(({ label, href }) => (
        <a
          key={href}
          href={href}
          aria-current={path === href ? 'page' : undefined}
          className={NAV_LINK}
          onClick={() => selectDrop()}
          onMouseEnter={() => {
            releaseSuppression();
            scheduleDropClose();
          }}
          onFocus={() => {
            releaseSuppression();
            closeDrop();
          }}
        >
          {label}
        </a>
      ))}
    </div>
  );
}

function DesktopDropPanel({
  dropKey,
  hidden,
  layout,
  panelLeft,
  animate,
  clearDropClose,
  selectDrop,
}: Readonly<{
  dropKey: NavDropKey;
  hidden: boolean;
  layout: DropLayout;
  panelLeft: number;
  animate: boolean;
  clearDropClose: () => void;
  selectDrop: (key?: NavDropKey) => void;
}>) {
  const groups = NAV_DROPS.find((drop) => drop.key === dropKey)?.groups ?? [];
  const platform = dropKey === 'platform';

  return (
    <div
      hidden={hidden}
      id={`desktop-nav-panel-${dropKey}`}
      onMouseEnter={clearDropClose}
      style={{
        left: panelLeft,
        width: layout[dropKey].width,
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100dvh - var(--marketing-nav-offset) - 2rem)',
      }}
      className={cn(
        'nav-panel absolute top-full mt-1.5 overflow-auto',
        animate && 'marketing-nav-panel',
      )}
    >
      <div
        className={cn('grid gap-x-2 p-2', platform && 'grid-cols-3', !platform && 'grid-cols-1')}
      >
        {groups.map((group) => (
          <div
            key={group.label ?? 'items'}
            className={cn('min-w-0', dropKey === 'resources' && 'grid grid-cols-2 gap-x-2')}
          >
            {group.label && <p className="nav-group-label">{group.label}</p>}
            {group.items.map((item) => (
              <NavItemLink key={item.title} item={item} onSelect={() => selectDrop()} />
            ))}
          </div>
        ))}
      </div>
      {platform && (
        <a className="nav-panel-footer" href={PLATFORM_OVERVIEW.href} onClick={() => selectDrop()}>
          <span>
            <span className="nav-row-title">{PLATFORM_OVERVIEW.title}</span>
            <span className="nav-row-desc">
              How measurement, diagnosis and action connect in one project.
            </span>
          </span>
          <ArrowRight aria-hidden className="size-4" />
        </a>
      )}
    </div>
  );
}
