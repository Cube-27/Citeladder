import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink } from '../primitives/button';
import { Eyebrow } from '../primitives/label';
import { Container } from '../primitives/section';
import { TrustStrip } from '../primitives/trust-strip';
import { HeroEntrance } from './hero-entrance';

/**
 * The hook — a centred opener standing on the atmospheric field.
 *
 * This was a two-column split: copy left, panel right, on flat cream. It read
 * as dull for a structural reason, not a motion one — the first screen had no
 * colour, no depth and a hard 26rem ceiling on the headline, so the biggest
 * type on the site was boxed into half the viewport while the other half held
 * a single white card. Centring the claim lets the display step actually be a
 * display step, and the field behind it gives the screen light to sit in.
 *
 * The ambient panel now sits BELOW the claim rather than beside it, where it
 * reads as the product moment the headline just promised. It stays
 * decorative-by-construction (see hero-visual); the labelled product canvas is
 * further down the page. No fake screenshots: the panel shows the same
 * illustrative questions the rest of the page uses and never claims to be a
 * real result.
 */
export function Hero() {
  const { hook } = LANDING_CONTENT;
  return (
    <header className="mkt-field-hero mkt-grid-field relative overflow-hidden">
      <Container className="relative z-1 py-20 md:py-28">
        <HeroEntrance className="mx-auto max-w-4xl text-center">
          <div className="flex justify-center">
            <Eyebrow>{hook.eyebrow}</Eyebrow>
          </div>
          <h1 className="font-mkt-display text-mkt-d1 text-mkt-ink mx-auto mt-6 max-w-[19ch] text-balance">
            {hook.title} <em className="mkt-keyword not-italic">{hook.titleAccent}</em>
          </h1>
          <p className="text-mkt-lead text-mkt-ink-soft mx-auto mt-6 max-w-[58ch]">{hook.body}</p>
          <div className="mt-9 flex flex-col justify-center gap-2.5 sm:flex-row sm:items-center">
            <ButtonLink href={DEMO_HREF} intent="primary" className="w-full sm:w-auto">
              {hook.primaryCta}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="#how-it-works" intent="secondary" className="w-full sm:w-auto">
              {hook.secondaryCta}
            </ButtonLink>
          </div>
          <TrustStrip className="mt-8 justify-center" />
        </HeroEntrance>
      </Container>
    </header>
  );
}
