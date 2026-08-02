import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink, IconButtonLink } from '../primitives/button';
import { Eyebrow } from '../primitives/label';
import { Container } from '../primitives/section';
import { HeroAtmosphere } from './hero-atmosphere';
import { HeroEntrance } from './hero-entrance';
import { HeadlineRotatingWord } from './headline-rotating-word';
import { RotatingEngineLogos } from './rotating-engine-logos';

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
 * decorative-by-construction; the labelled product canvas is further down the
 * page. No fake screenshots: the panel shows the same illustrative questions
 * the rest of the page uses and never claims to be a real result.
 */
export function Hero() {
  const { hook } = LANDING_CONTENT;
  return (
    <header className="mkt-field-hero mkt-grid-field -mt-mkt-nav pt-mkt-nav relative overflow-hidden">
      <HeroAtmosphere />
      <Container className="pt-mkt-80 pb-mkt-70 md:pt-mkt-120 md:pb-mkt-80 relative z-1">
        <HeroEntrance className="mx-auto max-w-5xl text-center">
          <div className="flex justify-center">
            <Eyebrow>{hook.eyebrow}</Eyebrow>
          </div>
          <h1 className="font-mkt-display text-mkt-h1 text-mkt-ink mt-mkt-30 mx-auto max-w-[32ch] text-balance">
            {hook.title}{' '}
            <em className="mkt-keyword not-italic">
              They ask <HeadlineRotatingWord /> instead.
            </em>
          </h1>
          <p className="text-mkt-lead text-mkt-ink-soft mt-mkt-30 mx-auto max-w-[80ch]">
            {hook.body}
          </p>
          <div className="mt-mkt-30 gap-mkt-14 flex flex-col justify-center sm:flex-row sm:items-center">
            <IconButtonLink
              href={DEMO_HREF}
              title={hook.primaryCta}
              icon={<ArrowRight aria-hidden />}
              className="self-center"
            />
            <ButtonLink href="#how-it-works" variant="ghost" className="w-full sm:w-auto">
              {hook.secondaryCta}
            </ButtonLink>
          </div>
          <RotatingEngineLogos className="mt-mkt-30 md:mt-mkt-40" />
        </HeroEntrance>
      </Container>
    </header>
  );
}
