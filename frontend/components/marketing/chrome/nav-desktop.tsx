import { ChevronDown } from 'lucide-react';
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
  'website-nav text-foreground relative z-1 inline-flex items-center gap-1.5 ' +
  'rounded-[var(--radius-control)] whitespace-nowrap px-2 py-2.5 font-medium transition-colors duration-300';

type DropLayout = Record<NavDropKey, { width: number }>;

type DesktopNavigationProps = {
  layout: DropLayout;
  lens: { left: number; width: number } | null;
  panelLeft: number;
  openDrop: NavDropKey | null;
  openSource: OpenSource | null;
  reduceMotion: boolean;
  linksRef: RefObject<HTMLDivElement | null>;
  clearDropClose: () => void;
  scheduleDropClose: () => void;
  closeDrop: () => void;
  /** Chosen a row or trigger: close and stay closed until pointer moves away. */
  selectDrop: (key?: NavDropKey) => void;
  releaseSuppression: (key?: NavDropKey) => void;
  openDropAt: (key: NavDropKey, trigger: HTMLElement, source?: OpenSource) => void;
  moveLens: (element: HTMLElement) => void;
  clearLens: () => void;
};

/** Desktop links and the shared hover-intent dropdown panel. */
export function DesktopNavigation({
  layout,
  lens,
  panelLeft,
  openDrop,
  openSource,
  reduceMotion,
  linksRef,
  clearDropClose,
  scheduleDropClose,
  closeDrop,
  selectDrop,
  releaseSuppression,
  openDropAt,
  moveLens,
  clearLens,
}: Readonly<DesktopNavigationProps>) {
  const path = useContext(NavigationPath);
  return (
    <div
      ref={linksRef}
      className="marketing-nav-track relative mx-auto hidden items-center xl:flex"
      onMouseEnter={clearDropClose}
      onMouseLeave={() => {
        // Leaving the nav is what re-arms hover after a selection.
        releaseSuppression();
        scheduleDropClose();
        clearLens();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeDrop();
      }}
    >
      {lens && (
        <span
          aria-hidden
          style={{ left: lens.left, width: lens.width }}
          className={cn(
            'marketing-nav-selection bg-panel pointer-events-none absolute inset-y-1 rounded-[var(--radius-control)]',
            !reduceMotion && 'transition-[left,width] duration-200 ease-out',
          )}
        />
      )}

      {NAV_DROPS.map(({ key, label, href }) => (
        <div
          key={key}
          className="group/drop z-1 flex items-center"
          onMouseEnter={(event) => openDropAt(key, event.currentTarget)}
          onMouseLeave={() => releaseSuppression(key)}
        >
          <a
            id={`desktop-nav-trigger-${key}`}
            href={href}
            aria-current={path === href ? 'page' : undefined}
            className={NAV_LINK}
            aria-expanded={openDrop === key}
            aria-controls={openDrop === key ? `desktop-nav-panel-${key}` : undefined}
            onClick={() => selectDrop(key)}
            onFocus={(event) => {
              // 'focus' so tabbing here opens the panel even right after a
              // selection suppressed hover.
              openDropAt(key, event.currentTarget, 'focus');
            }}
          >
            {label}
          </a>
          <button
            type="button"
            className="text-muted p-2"
            aria-label={`Toggle ${label} menu`}
            aria-expanded={openDrop === key}
            aria-controls={`desktop-nav-panel-${key}`}
            onClick={(event) =>
              openDrop === key ? closeDrop() : openDropAt(key, event.currentTarget, 'focus')
            }
          >
            <ChevronDown aria-hidden className="size-3.5" />
          </button>
          <DesktopDropPanel
            dropKey={key}
            hidden={openDrop !== key}
            layout={layout}
            panelLeft={panelLeft}
            animate={openSource === 'hover'}
            clearDropClose={clearDropClose}
            selectDrop={selectDrop}
          />
        </div>
      ))}

      {NAV_LINKS.map(({ label, href }) => (
        <a
          key={href}
          href={href}
          aria-current={path === href ? 'page' : undefined}
          className={NAV_LINK}
          onClick={() => selectDrop()}
          onMouseEnter={(event) => {
            releaseSuppression();
            scheduleDropClose();
            moveLens(event.currentTarget);
          }}
          onFocus={(event) => {
            releaseSuppression();
            scheduleDropClose();
            moveLens(event.currentTarget);
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
        'bg-panel shadow-overlay absolute top-full rounded-[var(--radius-overlay)] p-3',
        'mt-2 overflow-auto',
        animate && 'marketing-nav-panel',
      )}
    >
      {dropKey === 'platform' && <NavItemLink item={PLATFORM_OVERVIEW} onSelect={selectDrop} />}
      <div className={cn('grid', dropKey === 'platform' && 'grid-cols-3')}>
        {groups.map((group) => (
          <DesktopDropGroup key={group.label ?? 'items'} group={group} selectDrop={selectDrop} />
        ))}
      </div>
    </div>
  );
}

function DesktopDropGroup({
  group,
  selectDrop,
}: Readonly<{
  group: (typeof NAV_DROPS)[number]['groups'][number];
  selectDrop: (key?: NavDropKey) => void;
}>) {
  return (
    <div>
      {group.label && (
        <p className="website-eyebrow text-muted px-3.5 pt-2.5 pb-2">{group.label}</p>
      )}
      {group.items.map((item) => (
        <NavItemLink key={item.title} item={item} onSelect={selectDrop} />
      ))}
    </div>
  );
}
