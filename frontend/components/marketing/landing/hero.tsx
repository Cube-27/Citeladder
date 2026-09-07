import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { DemoButtonLink } from '../primitives/button';
import { Eyebrow } from '../primitives/label';
import { Container } from '../primitives/section';
import { HeroEntrance } from './hero-entrance';
import { RotatingEngineLogos } from './rotating-engine-logos';

/**
 * The hook — a light editorial opener on the reference system's model
 * (docs/design.md §Marketing): serif display in the navy ink, centred over the
 * brand's pastel atmosphere, with one primary action and the rotating engine
 * roster on the first screen itself. No product UI here — the hero is the
 * value proposition, the CTA, and the engines tracked; the page's evidence
 * lives in the sections below.
 */
export function Hero() {
  const { hook } = LANDING_CONTENT;
  return (
    <header className="band-grain bg-background relative -mt-[var(--marketing-nav-offset)] overflow-hidden pt-[var(--marketing-nav-offset)]">
      {/* Layered atmosphere: refined ambient light field over the white ground. Decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(110% 80% at 75% 0%, var(--color-atmosphere-blue) 0%, transparent 55%), radial-gradient(85% 70% at 20% 90%, var(--color-atmosphere-green) 0%, transparent 60%)',
        }}
      />
      <Container className="relative z-1 pt-20 pb-18 text-center md:pt-28 md:pb-24">
        <HeroEntrance className="mx-auto w-full max-w-4xl">
          <div className="border-border-subtle bg-panel/80 inline-flex items-center rounded-full border px-3.5 py-1 shadow-xs backdrop-blur-xs">
            <Eyebrow>{hook.eyebrow}</Eyebrow>
          </div>
          <h1 className="website-hero-display origin-centre text-foreground mx-auto mt-5 max-w-[24ch] text-balance">
            {hook.title} <em className="text-accent-text not-italic">{hook.titleAccent}</em>
          </h1>
          <p className="website-lead text-muted mx-auto mt-6 max-w-[58ch]">{hook.body}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3">
            <DemoButtonLink className="w-full sm:w-auto">
              {hook.primaryCta}
              <ArrowRight aria-hidden />
            </DemoButtonLink>
          </div>
          <RotatingEngineLogos className="mx-auto mt-10 w-full max-w-2xl" />
        </HeroEntrance>
      </Container>
    </header>
  );
}
