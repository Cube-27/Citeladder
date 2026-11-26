import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/ui/icon';
import { textRole } from '@/components/ui/typography';
import { Pause, Play } from '@/lib/icons';
import { useReducedMotion } from '@/lib/accessibility/use-reduced-motion';
import { cn } from '@/lib/utils';

type Shot = Readonly<{ file: string; width: number; height: number }>;

type SlideId = 'mcp' | 'search' | 'site-health';

type Slide = Readonly<{
  id: SlideId;
  name: string;
  line: string;
  main: Shot;
  accent: Shot;
}>;

const AUTH_SHOWCASE_SLIDES: readonly Slide[] = [
  {
    id: 'mcp',
    name: 'Connect MCP',
    line: 'Connect Claude, ChatGPT or another MCP client to read your CiteLadder evidence in chat.',
    main: { file: 'mcp-main', width: 541, height: 357 },
    accent: { file: 'mcp-accent', width: 615, height: 70 },
  },
  {
    id: 'search',
    name: 'Keyword Research',
    line: 'Keyword Research lists the keywords you rank for, the domains you compete with and your backlinks.',
    main: { file: 'search-main', width: 471, height: 283 },
    accent: { file: 'search-accent', width: 252, height: 184 },
  },
  {
    id: 'site-health',
    name: 'Site Health',
    line: 'Site Health crawls your site and checks indexing, structured data and AI crawler access.',
    main: { file: 'site-health-main', width: 661, height: 305 },
    accent: { file: 'site-health-accent', width: 202, height: 96 },
  },
];

type Place = Readonly<
  Partial<Record<'top' | 'bottom' | 'left' | 'right', number>> & { width: number }
>;

const PLACEMENT: Readonly<Record<SlideId, Readonly<{ main: Place; accent: Place }>>> = {
  mcp: { main: { top: 0, right: 0, width: 82 }, accent: { bottom: 0, left: 0, width: 88 } },
  search: { main: { top: 7, left: 0, width: 70 }, accent: { top: 45, right: 0, width: 40 } },
  'site-health': {
    main: { top: 22, left: 3, width: 94 },
    accent: { top: 7, right: 0, width: 30 },
  },
};

const ADVANCE_MS = 7000;

const STAGE: CSSProperties = { aspectRatio: '5 / 3' };

const MONO: CSSProperties = { filter: 'saturate(0)' };

const THEMES = [
  { theme: 'light', suffix: '' },
  { theme: 'dark', suffix: '-dark' },
] as const;
const SHOWN: CSSProperties = { opacity: 1 };
const HIDDEN: CSSProperties = { opacity: 0 };

function ShotPicture({
  shot,
  place,
  upcoming,
  over,
}: Readonly<{ shot: Shot; place: Place; upcoming: boolean; over: boolean }>) {
  const style = Object.fromEntries(
    Object.entries(place).map(([edge, percent]) => [edge, `${percent}%`]),
  );
  return (
    <div className={cn('absolute', over && 'z-raised')} style={style}>
      {THEMES.map(({ theme, suffix }) => (
        <picture key={theme} data-theme-art={theme} className="block">
          <source type="image/avif" srcSet={`/auth/${shot.file}${suffix}.avif`} />
          <img
            src={`/auth/${shot.file}${suffix}.webp`}
            width={shot.width}
            height={shot.height}
            alt=""
            loading="lazy"
            decoding="async"
            fetchPriority={upcoming ? 'low' : 'auto'}
            className="rounded-card block h-auto w-full"
            style={MONO}
          />
        </picture>
      ))}
    </div>
  );
}

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

function useAutoplay({
  target,
  intervalMs,
  enabled,
  onTick,
}: Readonly<{
  target: RefObject<Element | null>;
  intervalMs: number;
  enabled: boolean;
  onTick: () => void;
}>) {
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const tick = useRef(onTick);

  useEffect(() => {
    tick.current = onTick;
  });

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setInView(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState === 'visible');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const running = enabled && inView && pageVisible;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => tick.current(), intervalMs);
    return () => window.clearInterval(id);
  }, [running, intervalMs]);
}

const SHOWCASE_CONTROL =
  'focus-ring rounded-mark grid size-6 place-items-center transition-colors duration-fast motion-reduce:transition-none';

export function AuthShowcase() {
  const root = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(0);
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
      className="desktop:grid bg-page rounded-card gap-page-top px-gutter sticky top-2 my-2 me-2 hidden h-[calc(100dvh-1rem)] min-h-0 content-center overflow-hidden"
      aria-label="CiteLadder features"
      aria-roledescription="carousel"
    >
      <div className="grid" aria-live={rotating ? 'off' : 'polite'}>
        {AUTH_SHOWCASE_SLIDES.map((slide, index) => {
          const current = index === active;
          return (
            <section
              key={slide.id}
              className={cn(
                'col-start-1 row-start-1 grid justify-items-center gap-page-top transition-opacity duration-open motion-reduce:transition-none',
                current ? 'visible' : 'invisible',
              )}
              style={current ? SHOWN : HIDDEN}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}: ${slide.name}`}
              aria-hidden={!current}
              inert={!current}
            >
              <div className="max-w-narrow relative w-full" style={STAGE}>
                {seen.has(index) ? (
                  <>
                    <ShotPicture
                      shot={slide.main}
                      place={PLACEMENT[slide.id].main}
                      upcoming={!current}
                      over={false}
                    />
                    <ShotPicture
                      shot={slide.accent}
                      place={PLACEMENT[slide.id].accent}
                      upcoming={!current}
                      over
                    />
                  </>
                ) : null}
              </div>
              <div className="max-w-narrow grid gap-2 text-center">
                <p className={textRole('body', 'text-ink-2 text-balance')}>{slide.line}</p>
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
                <span
                  aria-hidden
                  className={cn(
                    'rounded-mark block h-2 transition-colors duration-fast motion-reduce:transition-none',
                    current ? 'bg-mark-ink w-5' : 'bg-control-line size-2',
                  )}
                />
              </button>
            );
          })}
        </div>
        {reducedMotion ? null : (
          <button
            type="button"
            className={cn(SHOWCASE_CONTROL, 'text-ink-2 hover:text-ink')}
            aria-label={stopped ? 'Play slides' : 'Pause slides'}
            onClick={() => setStopped((value) => !value)}
          >
            <Icon icon={stopped ? Play : Pause} />
          </button>
        )}
      </div>
    </aside>
  );
}
