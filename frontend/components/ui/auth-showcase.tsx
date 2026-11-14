import { Pause, Play } from 'lucide-react';
import { type RefObject, useEffect, useId, useRef, useState } from 'react';

import { Icon } from '@/components/ui/icon';
import { useAutoplay } from '@/lib/accessibility/use-autoplay';
import { useReducedMotion } from '@/lib/accessibility/use-reduced-motion';
import { cn } from '@/lib/utils';

/** A product picture in `public/auth/`, at its CSS size (the files are 2x). */
type Shot = Readonly<{ file: string; width: number; height: number }>;

type SlideId = 'mcp' | 'search' | 'site-health';

type Slide = Readonly<{
  id: SlideId;
  name: string;
  caption: string;
  line: string;
  /** The product window, and the card that floats over it. */
  main: Shot;
  accent: Shot;
}>;

/**
 * Captured from the website's coded product views (synthetic `.example`
 * records) at device scale 2, so no picture shows a real customer's data.
 */
const AUTH_SHOWCASE_SLIDES: readonly Slide[] = [
  {
    id: 'mcp',
    name: 'Connect MCP',
    caption: 'Ask your AI assistant about your visibility.',
    line: 'Connect Claude, ChatGPT or another MCP client to read your CiteLadder evidence in chat.',
    main: { file: 'mcp-main', width: 541, height: 357 },
    accent: { file: 'mcp-accent', width: 615, height: 70 },
  },
  {
    id: 'search',
    name: 'Keyword Research',
    caption: 'See the keywords you share with competitors.',
    line: 'Keyword Research lists the keywords you rank for, the domains you compete with and your backlinks.',
    main: { file: 'search-main', width: 471, height: 283 },
    accent: { file: 'search-accent', width: 252, height: 184 },
  },
  {
    id: 'site-health',
    name: 'Site Health',
    caption: 'Find what keeps your pages out of answers.',
    line: 'Site Health crawls your site and checks indexing, structured data and AI crawler access.',
    main: { file: 'site-health-main', width: 661, height: 305 },
    accent: { file: 'site-health-accent', width: 202, height: 96 },
  },
];

/** Each slide's window and floating card, placed in the shared stage. */
const PLACEMENT: Readonly<Record<SlideId, Readonly<{ main: string; accent: string }>>> = {
  mcp: { main: 'top-0 right-0 w-[82%]', accent: 'bottom-0 left-0 w-[88%]' },
  search: { main: 'top-[7%] left-0 w-[70%]', accent: 'top-[45%] right-0 w-[40%]' },
  'site-health': { main: 'top-[22%] left-[3%] w-[94%]', accent: 'top-[7%] right-0 w-[30%]' },
};

const ADVANCE_MS = 7000;

function ShotPicture({
  shot,
  place,
  upcoming,
}: Readonly<{ shot: Shot; place: string; upcoming: boolean }>) {
  return (
    <picture className={cn('absolute block', place)}>
      <source type="image/avif" srcSet={`/auth/${shot.file}.avif`} />
      {/* Lazy: the panel is hidden below `desktop:`, so phones never fetch it.
          Grayscale: the panel is black and white; the captures predate
          the system's palette. */}
      <img
        src={`/auth/${shot.file}.webp`}
        width={shot.width}
        height={shot.height}
        alt=""
        loading="lazy"
        decoding="async"
        fetchPriority={upcoming ? 'low' : 'auto'}
        className="shadow-pop block h-auto w-full rounded-lg grayscale"
      />
    </picture>
  );
}

/**
 * Fine film grain over the field: tiled fractal noise with its colour removed,
 * faded until it reads only up close. Decoration; no colour of its own.
 */
function Grain() {
  const filterId = useId();
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 size-full opacity-50 dark:opacity-15"
    >
      <filter id={filterId}>
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={3} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${filterId})`} />
    </svg>
  );
}

/** Whether the pointer is over `target` or focus is inside it. */
function useHeld(target: RefObject<HTMLElement | null>): boolean {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    const focusIn = () => setFocused(true);
    const focusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) {
        setFocused(false);
      }
    };
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('focusin', focusIn);
    element.addEventListener('focusout', focusOut);
    return () => {
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('focusin', focusIn);
      element.removeEventListener('focusout', focusOut);
    };
  }, [target]);

  return hovered || focused;
}

const SHOWCASE_CONTROL =
  'focus-ring grid size-6 place-items-center rounded-sm transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none';

/**
 * AuthShowcase — account access's product showcase: one feature per slide on
 * a black-and-white, grained `surface-sunken` field (no colour). Every
 * slide shares one grid cell, so the stage and caption keep the tallest
 * slide's size and nothing moves between slides. It turns slowly, pauses
 * while hovered or focused, and never turns on its own under reduced motion;
 * the dots and the pause control are keyboard reachable.
 */
export function AuthShowcase() {
  const root = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  // Slides that have been shown, or are next (fetched at low priority, so a
  // turn never reveals an empty stage); the rest do not fetch pictures yet.
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  const held = useHeld(root);
  const [stopped, setStopped] = useState(false);
  const count = AUTH_SHOWCASE_SLIDES.length;

  function show(index: number) {
    setActive(index);
    setSeen((current) => new Set([...current, index, (index + 1) % count]));
  }

  const rotating = !reducedMotion && !stopped;
  useAutoplay({
    target: root,
    intervalMs: ADVANCE_MS,
    enabled: rotating && !held,
    onTick: () => show((active + 1) % count),
  });

  return (
    <aside
      ref={root}
      className="desktop:grid sticky top-0 hidden h-dvh p-3"
      aria-label="CiteLadder features"
      aria-roledescription="carousel"
    >
      <div className="bg-surface-sunken relative isolate grid min-h-0 content-center gap-[var(--page-section-gap)] overflow-clip rounded-lg p-[var(--page-section-gap)]">
        <Grain />
        <div className="grid" aria-live={rotating ? 'off' : 'polite'}>
          {AUTH_SHOWCASE_SLIDES.map((slide, index) => {
            const current = index === active;
            return (
              // A labelled section is a region: the APG carousel's named slide,
              // announced with its "slide" role description. Visibility is
              // discrete, so a hidden slide also leaves the tab order.
              <section
                key={slide.id}
                className={cn(
                  'col-start-1 row-start-1 grid justify-items-center gap-[var(--page-section-gap)] transition-[opacity,visibility] duration-[var(--motion-slow)] motion-reduce:transition-none',
                  current ? 'visible opacity-100' : 'invisible opacity-0',
                )}
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}: ${slide.name}`}
                aria-hidden={!current}
                inert={!current}
              >
                <div className="relative aspect-[5/3] w-full max-w-144">
                  {seen.has(index) ? (
                    <>
                      <ShotPicture
                        shot={slide.main}
                        place={PLACEMENT[slide.id].main}
                        upcoming={!current}
                      />
                      <ShotPicture
                        shot={slide.accent}
                        place={cn('z-10', PLACEMENT[slide.id].accent)}
                        upcoming={!current}
                      />
                    </>
                  ) : null}
                </div>
                <div className="grid max-w-104 gap-2 text-center">
                  <p className="text-title text-ink font-medium text-balance">{slide.caption}</p>
                  <p className="text-body text-ink-secondary text-pretty">{slide.line}</p>
                </div>
              </section>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="flex">
            {AUTH_SHOWCASE_SLIDES.map((slide, index) => {
              const current = index === active;
              return (
                <button
                  key={slide.id}
                  type="button"
                  className={SHOWCASE_CONTROL}
                  aria-label={slide.name}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => show(index)}
                >
                  {/* A fixed 24px target: the current dot only widens inside it. */}
                  <span
                    aria-hidden
                    className={cn(
                      'block h-2 rounded-xs transition-[width,background-color] duration-[var(--motion-fast)] motion-reduce:transition-none',
                      current ? 'bg-ink w-5' : 'bg-line-strong w-2',
                    )}
                  />
                </button>
              );
            })}
          </div>
          {reducedMotion ? null : (
            <button
              type="button"
              className={cn(SHOWCASE_CONTROL, 'text-ink-secondary hover:text-ink')}
              aria-label={stopped ? 'Play slides' : 'Pause slides'}
              onClick={() => setStopped((value) => !value)}
            >
              <Icon icon={stopped ? Play : Pause} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
