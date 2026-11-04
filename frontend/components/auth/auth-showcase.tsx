'use client';

import { Pause, Play } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/ui/icon';
import { useAutoplay } from '@/lib/accessibility/use-autoplay';
import { useReducedMotion } from '@/lib/accessibility/use-reduced-motion';

/** A product picture in `public/auth/`, at its CSS size (the files are 2x). */
type Shot = Readonly<{ file: string; width: number; height: number }>;

type Slide = Readonly<{
  id: 'mcp' | 'search' | 'site-health';
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

const ADVANCE_MS = 7000;

function ShotPicture({
  shot,
  kind,
  upcoming,
}: Readonly<{ shot: Shot; kind: 'main' | 'accent'; upcoming: boolean }>) {
  return (
    <picture className="auth-shot" data-shot={kind}>
      <source type="image/avif" srcSet={`/auth/${shot.file}.avif`} />
      {/* Lazy: the panel is display:none on narrow screens, so phones never fetch it. */}
      <img
        src={`/auth/${shot.file}.webp`}
        width={shot.width}
        height={shot.height}
        alt=""
        loading="lazy"
        decoding="async"
        fetchPriority={upcoming ? 'low' : 'auto'}
      />
    </picture>
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

/**
 * The account-access showcase: one product feature per slide over a light
 * grained field. Every slide shares one grid cell, so the stage and caption
 * keep the tallest slide's size and nothing moves between slides. It turns
 * slowly, pauses while hovered or focused, and never turns on its own under
 * reduced motion; the dots and the pause control are keyboard reachable.
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
      className="auth-showcase"
      aria-label="CiteLadder features"
      aria-roledescription="carousel"
    >
      <div className="auth-showcase-field">
        <div className="auth-showcase-slides" aria-live={rotating ? 'off' : 'polite'}>
          {AUTH_SHOWCASE_SLIDES.map((slide, index) => {
            const current = index === active;
            return (
              // A labelled section is a region: the APG carousel's named slide,
              // announced with its "slide" role description.
              <section
                key={slide.id}
                className="auth-showcase-slide"
                data-slide={slide.id}
                data-current={current}
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}: ${slide.name}`}
                aria-hidden={!current}
                inert={!current}
              >
                <div className="auth-showcase-stage">
                  {seen.has(index) ? (
                    <>
                      <ShotPicture shot={slide.main} kind="main" upcoming={!current} />
                      <ShotPicture shot={slide.accent} kind="accent" upcoming={!current} />
                    </>
                  ) : null}
                </div>
                <div className="auth-showcase-copy">
                  <p className="auth-showcase-caption">{slide.caption}</p>
                  <p className="auth-showcase-line">{slide.line}</p>
                </div>
              </section>
            );
          })}
        </div>
        <div className="auth-showcase-controls">
          <div className="auth-showcase-dots">
            {AUTH_SHOWCASE_SLIDES.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className="auth-showcase-dot focus-ring"
                aria-label={slide.name}
                aria-current={index === active ? 'true' : undefined}
                onClick={() => show(index)}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
          {reducedMotion ? null : (
            <button
              type="button"
              className="auth-showcase-toggle focus-ring"
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
