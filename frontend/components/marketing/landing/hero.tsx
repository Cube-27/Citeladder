import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { DEMO_CTA, DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink } from '../primitives/button';
import { Eyebrow, Meta } from '../primitives/label';
import { Container } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/**
 * A centred text opener that deliberately stops short of the fold: at ~76svh
 * the top edge of the workspace scene below sits just inside the viewport, so
 * the first screen shows the claim AND the product rather than the claim alone.
 * The scene then completes its scroll reveal as the reader moves into it.
 */
export function Hero() {
  const { hero } = LANDING_CONTENT;
  return (
    <header className="flex min-h-[calc(76svh-var(--spacing-mkt-nav))] items-center py-12">
      <Container>
        <Reveal className="mx-auto max-w-4xl text-center">
          <Eyebrow>{hero.eyebrow}</Eyebrow>
          <h1 className="font-mkt-display text-mkt-d1 text-mkt-ink mkt-display-w mx-auto mt-5 mb-5 max-w-[18ch]">
            {hero.title} <em className="text-mkt-accent-display not-italic">{hero.accent}</em>
          </h1>
          <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[46ch]">{hero.body}</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <ButtonLink href={DEMO_HREF} className="w-full sm:w-auto">
              {DEMO_CTA}
              <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
            <ButtonLink href="#platform" intent="secondary" className="w-full sm:w-auto">
              {hero.secondaryCta}
            </ButtonLink>
          </div>
          <Meta as="p" className="mt-4">
            {hero.note}
          </Meta>
        </Reveal>
      </Container>
    </header>
  );
}
