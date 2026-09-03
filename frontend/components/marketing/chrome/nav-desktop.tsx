import { AnimatePresence, m, type Transition } from 'motion/react';
import Link from 'next/link';
import type { RefObject } from 'react';

import { NAV_DROPS, NAV_LINKS, type NavDropKey } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

import type { OpenSource } from './nav';
import { NavItemLink } from './nav-items';

const NAV_LINK =
  'website-nav text-foreground hover:text-accent-text relative z-1 inline-flex items-center gap-2 ' +
  'rounded-[var(--radius-control)] px-4 py-4 font-medium transition-colors duration-300';

type DropLayout = Record<NavDropKey, { width: number; twoColumn: boolean }>;

type DesktopNavigationProps = {
  layout: DropLayout;
  lens: { left: number; width: number } | null;
  panelLeft: number;
  openDrop: NavDropKey | null;
  reduceMotion: boolean | null;
  linksRef: RefObject<HTMLDivElement | null>;
  lensTransition: Transition;
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
  reduceMotion,
  linksRef,
  lensTransition,
  clearDropClose,
  scheduleDropClose,
  closeDrop,
  selectDrop,
  releaseSuppression,
  openDropAt,
  moveLens,
  clearLens,
}: Readonly<DesktopNavigationProps>) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape and blur are delegated from the focusable links inside this navigation boundary.
    <div
      ref={linksRef}
      className="relative mx-auto hidden items-center lg:flex"
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
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeDrop();
      }}
    >
      {lens && (
        <m.span
          layout={!reduceMotion}
          aria-hidden
          style={{ left: lens.left, width: lens.width }}
          transition={lensTransition}
          className={cn(
            'border-border-subtle bg-panel shadow-elevated pointer-events-none rounded-[var(--radius-control)]',
            'absolute inset-y-0 border',
          )}
        />
      )}

      {NAV_DROPS.map(({ key, label, href }) => (
        <div
          key={key}
          className="relative z-1 flex items-center"
          onMouseEnter={(event) => openDropAt(key, event.currentTarget)}
          onMouseLeave={() => releaseSuppression(key)}
        >
          <Link
            href={href}
            className={NAV_LINK}
            aria-haspopup="true"
            aria-expanded={openDrop === key}
            aria-controls={openDrop === key ? `desktop-nav-panel-${key}` : undefined}
            onClick={() => selectDrop(key)}
            onFocus={(event) => {
              const parent = event.currentTarget.parentElement;
              // 'focus' so tabbing here opens the panel even right after a
              // selection suppressed hover.
              if (parent) openDropAt(key, parent, 'focus');
            }}
          >
            {label}
          </Link>
        </div>
      ))}

      {NAV_LINKS.map(({ label, href }) => (
        <Link
          key={href}
          href={href}
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
        </Link>
      ))}

      <AnimatePresence>
        {openDrop !== null && (
          <DesktopDropPanel
            dropKey={openDrop}
            layout={layout}
            panelLeft={panelLeft}
            clearDropClose={clearDropClose}
            selectDrop={selectDrop}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DesktopDropPanel({
  dropKey,
  layout,
  panelLeft,
  clearDropClose,
  selectDrop,
}: Readonly<{
  dropKey: NavDropKey;
  layout: DropLayout;
  panelLeft: number;
  clearDropClose: () => void;
  selectDrop: (key?: NavDropKey) => void;
}>) {
  const groups = NAV_DROPS.find((drop) => drop.key === dropKey)?.groups ?? [];

  return (
    <div
      id={`desktop-nav-panel-${dropKey}`}
      onMouseEnter={clearDropClose}
      style={{
        left: panelLeft,
        width: layout[dropKey].width,
        maxWidth: 'calc(100vw - 2rem)',
      }}
      className={cn(
        'border-border-subtle bg-panel shadow-elevated absolute top-full rounded-[var(--radius-control)]',
        'mt-2 overflow-hidden border',
      )}
    >
      <div className={cn('grid', layout[dropKey].twoColumn && 'sm:grid-cols-2')}>
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
  if (!group.label)
    return (
      <div className="p-2">
        {group.items.map((item) => (
          <NavItemLink key={item.title} item={item} onSelect={selectDrop} />
        ))}
      </div>
    );

  return (
    <div className="border-border-subtle bg-background-alt border-t p-2 sm:border-t-0 sm:border-l">
      <p className="website-eyebrow text-muted px-3 pt-2.5 pb-2">{group.label}</p>
      {group.items.map((item) => (
        <NavItemLink key={item.title} item={item} onSelect={selectDrop} />
      ))}
    </div>
  );
}
