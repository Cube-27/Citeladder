import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { DEMO_CTA, DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink } from '../primitives/button';
import { Eyebrow, Meta } from '../primitives/label';
import { Container } from '../primitives/section';
import { Reveal } from '../primitives/reveal';
import { ObservationField } from '../scenes/observation-field';

/**
 * The page's single h1, then the observation scene. Copy is centred and the
 * scene is full width — the deck's composition, on the shared container so
 * the wordmark, the headline and the scene edge all sit on one optical line.
 */
export function Hero() {
  const { hero } = LANDING_CONTENT;
  return (
    <header className="pt-16 pb-14 md:pt-24 md:pb-16">
      <Container>
        <Reveal className="mx-auto mb-14 max-w-4xl text-center md:mb-16">
          <Eyebrow>{hero.eyebrow}</Eyebrow>
          <h1 className="font-mkt-display text-mkt-d1 text-mkt-ink mx-auto mt-6 mb-6 max-w-[16ch] font-medium">
            {hero.title} <em className="text-mkt-accent-display not-italic">{hero.accent}</em>
          </h1>
          <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[46ch]">{hero.body}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <ButtonLink href={DEMO_HREF} className="w-full sm:w-auto">
              {DEMO_CTA}
              <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
            <ButtonLink href="#platform" intent="secondary" className="w-full sm:w-auto">
              {hero.secondaryCta}
            </ButtonLink>
          </div>
          <Meta as="p" className="mt-5">
            {hero.note}
          </Meta>
        </Reveal>

        <Reveal>
          <ObservationField />
        </Reveal>
      </Container>
    </header>
  );
}
