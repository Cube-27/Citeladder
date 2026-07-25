'use client';

import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/lib/api/auth';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/utils';

import { MarketingLogo } from './marketing-logo';

const ACTIVE_PROJECT_STORAGE_KEY = 'searchify.active-project-id';

function hasStoredActiveProject(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY));
  } catch {
    return false;
  }
}

type DropKey = 'product' | 'resources' | 'solutions';

type NavDropItem =
  | { title: string; desc: string; href: string; external?: boolean }
  | { num: string; title: string; desc: string; href: string };

type NavDropGroup = {
  label?: string;
  items: readonly NavDropItem[];
};

type NavDrop = {
  key: DropKey;
  label: string;
  groups: readonly NavDropGroup[];
};

const NAV_DROPS: readonly NavDrop[] = [
  {
    key: 'product',
    label: 'Product',
    groups: [
      {
        items: [
          {
            title: 'Three-engine coverage',
            desc: 'One audit across all engines',
            href: '/#features',
          },
          {
            title: 'Deterministic scoring',
            desc: 'Same data scores the same',
            href: '/#features',
          },
          {
            title: 'Evidence explorer',
            desc: 'Every metric links to its run',
            href: '/#features',
          },
          {
            title: 'Competitor benchmarking',
            desc: 'Share of answers per prompt',
            href: '/#features',
          },
          {
            title: 'Your own API keys',
            desc: 'Encrypted and never shared',
            href: '/#features',
          },
          {
            title: 'Repeatable trends',
            desc: 'Visibility period over period',
            href: '/#features',
          },
        ],
      },
      {
        label: 'How it works',
        items: [
          {
            num: '01',
            title: 'Set up',
            desc: 'Set your brand and prompts',
            href: '/#how-it-works',
          },
          {
            num: '02',
            title: 'Run the audit',
            desc: 'Every prompt on your own keys',
            href: '/#how-it-works',
          },
          {
            num: '03',
            title: 'Read the evidence',
            desc: 'Each score links to a response',
            href: '/#how-it-works',
          },
        ],
      },
    ],
  },
  {
    key: 'resources',
    label: 'Resources',
    groups: [
      {
        items: [
          {
            title: 'Blog',
            desc: 'Guides and audit teardowns',
            href: '/blog',
          },
          {
            title: 'FAQ',
            desc: 'Straight answers on how it works',
            href: '/faq',
          },
          {
            title: 'Compare',
            desc: 'How Searchify compares',
            href: '/compare',
          },
        ],
      },
    ],
  },
  {
    key: 'solutions',
    label: 'Solutions',
    groups: [
      {
        items: [
          {
            title: 'Agencies',
            desc: 'Audits for every client workspace',
            href: '/solutions#agencies',
          },
          {
            title: 'In-house teams',
            desc: 'AI answers beside your rankings',
            href: '/solutions#in-house',
          },
          {
            title: 'Founders',
            desc: 'See if engines recommend you',
            href: '/solutions#founders',
          },
          {
            title: 'PR & comms',
            desc: 'See what engines say after a launch',
            href: '/solutions#pr',
          },
        ],
      },
    ],
  },
];

/**
 * Leading marker for a dropdown row. Feature rows have none — the rows are
 * text only. The "How it works" steps keep their number because it carries
 * the sequence; it is content, not decoration.
 */
function DropGlyph({ item }: Readonly<{ item: NavDropItem }>) {
  if ('num' in item) {
    return <span className="d-icon mono-num">{item.num}</span>;
  }
  return null;
}

/** True for items that leave the site (plain <a target="_blank">). */
function isExternal(item: NavDropItem): boolean {
  return 'external' in item && item.external === true;
}

/** Desktop dropdown panel row — internal rows use Link, external a plain <a>. */
function DropItemLink({ item, onSelect }: Readonly<{ item: NavDropItem; onSelect: () => void }>) {
  const body = (
    <>
      <DropGlyph item={item} />
      <span className="d-text">
        <b>{item.title}</b>
        <small>{item.desc}</small>
      </span>
    </>
  );
  if (isExternal(item)) {
    return (
      <a
        className="drop-item"
        href={item.href}
        role="menuitem"
        target="_blank"
        rel="noreferrer"
        onClick={onSelect}
      >
        {body}
        <ArrowUpRight className="d-ext" aria-hidden />
      </a>
    );
  }
  return (
    <Link className="drop-item" href={item.href} role="menuitem" onClick={onSelect}>
      {body}
    </Link>
  );
}

/** Mobile accordion row — same internal/external split as the desktop rows. */
function MobileItemLink({ item, onSelect }: Readonly<{ item: NavDropItem; onSelect: () => void }>) {
  const body = (
    <>
      <DropGlyph item={item} />
      {item.title}
    </>
  );
  if (isExternal(item)) {
    return (
      <a className="m-item" href={item.href} target="_blank" rel="noreferrer" onClick={onSelect}>
        {body}
        <ArrowUpRight className="d-ext" aria-hidden />
      </a>
    );
  }
  return (
    <Link className="m-item" href={item.href} onClick={onSelect}>
      {body}
    </Link>
  );
}

/**
 * LandingNav — sticky glass nav for the public marketing site.
 *
 * Desktop: "Product" / "Resources" / "Solutions" open hover-intent dropdown
 * panels (open on hover AND keyboard focus; trigger click only ever opens —
 * never closes a hover-open panel — and item click + Esc close; chevron
 * rotates, an invisible bridge covers the trigger→panel gap so the pointer
 * never loses hover). "Enterprise" / "Pricing" are plain links with no
 * dropdown chrome.
 *
 * The visible dropdown SURFACE is a single `.drop-frame` element that lives in
 * `.nav-links` and never remounts: it paints the background, border and
 * shadow, and the only thing that ever animates about it is its height (plus a
 * fade on open/close). Each trigger still owns a `.drop` panel nested inside
 * its `.nav-item` — that nesting is what keeps the submenu keyboard-reachable
 * (Tab moves from the trigger into the menu items without leaving the subtree,
 * so onBlurCapture doesn't close it) — but those panels are transparent
 * content layers pinned to the exact same fixed geometry as the frame.
 * Switching triggers therefore reads as one stationary box stretching to fit
 * new contents: the frame holds opacity 1 and position while its height eases,
 * and only the content cross-fades.
 *
 * ≤860px: a hamburger opens a slide-down menu with
 * tap-to-expand accordions (Esc closes it too). The strip is fixed to the top
 * of the viewport; its bottom hairline strengthens once the page scrolls. Open state is driven from React
 * (`.open`) so `aria-expanded` stays truthful; class lists go through `cn()`
 * so prettier can't mangle conditional tokens; all transitions live in
 * marketing.css, gated behind prefers-reduced-motion. Anchors are absolute
 * (`/#features`, `/#how-it-works`) so they resolve from any subpage.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [openDrop, setOpenDrop] = useState<DropKey | null>(null);
  // True only when the panel opened while ANOTHER panel was already open —
  // that is the case that should glide sideways. A first open grows out of
  const closeTimer = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openAcc, setOpenAcc] = useState<DropKey | null>(null);

  const me = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: ({ signal }) => authApi.me({ signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: ({ signal }) => projectsApi.listProjects({ signal }),
    enabled: me.isSuccess,
  });

  const isAuthenticated = me.isSuccess;
  const dashboardHref =
    (projects && projects.length > 0) || hasStoredActiveProject() ? '/visibility' : '/onboarding';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMobile = () => {
    setMobileOpen(false);
    setOpenAcc(null);
  };

  const clearDropClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const openDesktopDrop = (key: DropKey) => {
    clearDropClose();
    // No switch/open distinction is needed any more: the panel is one element
    // that stays mounted, so moving between triggers only changes which
    // content it holds — Motion's `layout` handles the resize either way.
    setOpenDrop(key);
  };

  const closeDrop = () => {
    setOpenDrop(null);
  };

  const scheduleDropClose = () => {
    clearDropClose();
    closeTimer.current = window.setTimeout(closeDrop, 140);
  };

  useEffect(() => () => clearDropClose(), []);

  // Esc closes an open mobile menu (desktop dropdowns handle their own Esc
  // inside dropProps, where they can also blur the trigger).
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        setOpenAcc(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const dropProps = (key: DropKey) => ({
    onMouseEnter: () => openDesktopDrop(key),
    onFocusCapture: () => openDesktopDrop(key),
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        closeDrop();
        (document.activeElement as HTMLElement | null)?.blur();
      }
    },
  });

  const toggleAcc = (key: DropKey) => setOpenAcc((current) => (current === key ? null : key));

  return (
    <div className={cn('nav-wrap', scrolled && 'scrolled')}>
      <nav className="site-nav" aria-label="Main navigation">
        <Link className="wordmark" href="/" aria-label="Searchify home">
          <MarketingLogo size={27} />
          <span>Searchify</span>
          <span className="by-tag">by CUBE27</span>
        </Link>
        <div
          className="nav-links"
          onMouseEnter={clearDropClose}
          onMouseLeave={scheduleDropClose}
          onBlurCapture={(event) => {
            // The panel is a sibling of the triggers, so "did focus leave the
            // menu?" is a question about the whole group, not one item.
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              closeDrop();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              closeDrop();
              (document.activeElement as HTMLElement | null)?.blur();
            }
          }}
        >
          {NAV_DROPS.map(({ key, label }) => {
            const isOpen = openDrop === key;
            return (
              <div className={cn('nav-item', isOpen && 'open')} key={key} {...dropProps(key)}>
                <button
                  className="nav-link"
                  type="button"
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  aria-controls={isOpen ? `desktop-nav-panel-${key}` : undefined}
                  onClick={() => openDesktopDrop(key)}
                >
                  {label} <ChevronDown className="chev" aria-hidden />
                </button>
              </div>
            );
          })}
          <Link className="nav-link" href="/enterprise">
            Enterprise
          </Link>
          <Link className="nav-link" href="/pricing">
            Pricing
          </Link>
          {/* ONE panel for all three triggers, mounted once and kept mounted
              while the pointer moves between them.

              This is the whole fix. An earlier version gave each trigger its
              own panel and shared a `layoutId`; Motion then ran its built-in
              crossfade between the outgoing and incoming elements, which both
              dipped to ~0.1 opacity mid-switch — the box visibly blinked and
              two sets of rows were briefly legible. With a single element
              there is nothing to crossfade: `layout` simply animates the box
              from one size to the next (FLIP), and the rows swap inside it.

              AnimatePresence wraps only open/close, never the switch. */}
          <AnimatePresence>
            {openDrop !== null ? (
              <motion.div
                layout
                className={cn('drop', `drop-${openDrop}`)}
                id={`desktop-nav-panel-${openDrop}`}
                role="menu"
                onMouseEnter={clearDropClose}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 320, damping: 34, mass: 0.7 }
                }
              >
                <motion.div
                  key={openDrop}
                  className="drop-content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.14, ease: 'easeOut' }}
                >
                  {(NAV_DROPS.find((d) => d.key === openDrop)?.groups ?? []).map((group) =>
                    group.label ? (
                      <div className="d-group" key={group.label}>
                        <span className="d-group-label">{group.label}</span>
                        <div className="d-steps">
                          {group.items.map((item) => (
                            <DropItemLink key={item.title} item={item} onSelect={closeDrop} />
                          ))}
                        </div>
                      </div>
                    ) : (
                      group.items.map((item) => (
                        <DropItemLink key={item.title} item={item} onSelect={closeDrop} />
                      ))
                    ),
                  )}
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="nav-actions">
          <button
            className="hamburger"
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen((open) => !open)}
          >
            <Menu className="icon-menu" aria-hidden />
            <X className="icon-close" aria-hidden />
          </button>
          {isAuthenticated ? (
            <Link className="btn btn-primary btn-sm" href={dashboardHref}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link className="signin" href="/login">
                Sign in
              </Link>
              <Link className="btn btn-primary btn-sm" href="/register">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
      <div className={cn('mobile-menu', mobileOpen && 'open')} id="mobile-menu">
        {NAV_DROPS.map(({ key, label, groups }) => (
          <div className={cn('acc', openAcc === key && 'open')} key={key}>
            <button
              className="acc-head"
              type="button"
              aria-expanded={openAcc === key}
              aria-controls={`acc-${key}`}
              onClick={() => toggleAcc(key)}
            >
              {label} <ChevronDown className="chev" aria-hidden />
            </button>
            <div className="acc-body" id={`acc-${key}`}>
              {groups.map((group) => (
                <Fragment key={group.label ?? 'items'}>
                  {group.label ? <div className="m-label">{group.label}</div> : null}
                  {group.items.map((item) => (
                    <MobileItemLink key={item.title} item={item} onSelect={closeMobile} />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        ))}
        <Link className="m-plain" href="/enterprise" onClick={closeMobile}>
          Enterprise
        </Link>
        <Link className="m-plain" href="/pricing" onClick={closeMobile}>
          Pricing
        </Link>
        <div className="m-sep" />
        {isAuthenticated ? (
          <Link className="m-plain" href={dashboardHref} onClick={closeMobile}>
            Dashboard
          </Link>
        ) : (
          <Link className="m-plain" href="/login" onClick={closeMobile}>
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
