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
    <header className="band-grain bg-background relative -mt-16 overflow-hidden pt-16">
      {/* The pastel atmosphere: two low-alpha radial washes from the brand's
          own tile families over the white ground. Decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(90% 70% at 82% 4%, var(--color-atmosphere-blue) 0%, transparent 60%), radial-gradient(85% 70% at 12% 100%, var(--color-atmosphere-green) 0%, transparent 62%)',
        }}
      />
      <Container className="relative z-1 pt-20 pb-18 text-center md:pt-28 md:pb-24">
        <HeroEntrance className="mx-auto w-full max-w-4xl">
          <Eyebrow>{hook.eyebrow}</Eyebrow>
          <h1 className="website-hero-display origin-centre text-foreground mx-auto mt-5 max-w-[24ch] text-balance">
            {hook.title} <em className="text-accent-text not-italic">{hook.titleAccent}</em>
          </h1>
          <p className="website-lead text-muted mx-auto mt-6 max-w-[58ch]">{hook.body}</p>
          <div className="mt-8 flex justify-center">
            <DemoButtonLink className="w-full sm:w-auto">
              {hook.primaryCta}
              <ArrowRight aria-hidden />
            </DemoButtonLink>
          </div>
          {/* w-full: the roster is a flex-column grandchild here, and `mx-auto`
              alone would disable flex stretch and collapse the rotor slots. */}
          <RotatingEngineLogos className="mx-auto mt-14 w-full max-w-2xl" />
        </HeroEntrance>
      </Container>
    </header>
  );
}
