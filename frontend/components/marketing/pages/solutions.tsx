import type { ComponentType } from 'react';
import { ArrowRight, Briefcase, Building2, Megaphone, ShoppingBag, Sparkles } from 'lucide-react';

import { DEMO_CTA } from '@/lib/marketing-content/nav';
import {
  SOLUTION_SEGMENTS,
  SOLUTIONS_HERO,
  type SolutionScene,
} from '@/lib/marketing-content/solutions';
import { cn } from '@/lib/utils';

import { ButtonLink, DemoButtonLink, DemoTextLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';
import {
  AnswerView,
  CommerceView,
  ProductShot,
  SiteHealthView,
  SourcesView,
  VisibilityView,
} from '../scenes/product-views';

/**
 * `/solutions` — one page, one row per team: copy beside the product view
 * that team reads first. The section ids (`agencies`, `in-house`, `founders`,
 * `commerce`, `pr`) are targets of the nav's Solutions menu and the footer,
 * so they are part of the route's contract.
 */
const SEGMENT_ICONS: Readonly<Record<string, ComponentType<{ className?: string }>>> = {
  agencies: Briefcase,
  'in-house': Building2,
  founders: Sparkles,
  commerce: ShoppingBag,
  pr: Megaphone,
};

const SCENE_VIEWS: Readonly<Record<SolutionScene, { title: string; View: ComponentType }>> = {
  share: { title: 'AI Visibility', View: VisibilityView },
  health: { title: 'Site Health', View: SiteHealthView },
  sample: { title: 'Answer record', View: AnswerView },
  commerce: { title: 'AI Shelf', View: CommerceView },
  citations: { title: 'Sources', View: SourcesView },
};

export function SolutionsHero() {
  return (
    <PageHero title={SOLUTIONS_HERO.title} lead={SOLUTIONS_HERO.lead} centered>
      <nav aria-label="Solutions by team" className="ed-jump">
        {SOLUTION_SEGMENTS.map(({ id, label }) => {
          const Icon = SEGMENT_ICONS[id];
          return (
            <a key={id} href={`#${id}`} className="website-nav">
              {Icon && <Icon aria-hidden className="size-4" />}
              {label}
            </a>
          );
        })}
      </nav>
    </PageHero>
  );
}

export function SolutionSegments() {
  return (
    <>
      {SOLUTION_SEGMENTS.map((segment, index) => {
        const { title, View } = SCENE_VIEWS[segment.scene];
        return (
          <Section
            key={segment.id}
            id={segment.id}
            divided={index > 0}
            aria-labelledby={`${segment.id}-title`}
          >
            <div className={cn('mk-dive', index % 2 === 1 && 'mk-dive-reverse')}>
              <div className="mk-dive-copy">
                <h2
                  id={`${segment.id}-title`}
                  className="website-section-heading max-w-[26ch] text-balance"
                >
                  {segment.title}
                </h2>
                <p className="website-body-lg text-muted max-w-[60ch]">{segment.lead}</p>
                {segment.body && (
                  <p className="website-body-lg text-muted max-w-[60ch]">{segment.body}</p>
                )}
                <div className="ed-segment-links">
                  {segment.guide && (
                    <a className="mk-text-link" href={segment.guide.href}>
                      {segment.guide.label}
                      <ArrowRight aria-hidden className="size-4" />
                    </a>
                  )}
                  <DemoTextLink className="website-body">
                    {segment.cta}
                    <ArrowRight aria-hidden />
                  </DemoTextLink>
                </div>
              </div>
              <ProductShot title={title}>
                <View />
              </ProductShot>
            </div>
          </Section>
        );
      })}
    </>
  );
}

export function SolutionsCta() {
  return (
    <Section className="marketing-closing-band" aria-label="Get started">
      <div className="flex flex-col items-center gap-8 text-center" data-cta-placement="closing">
        <SectionHeader
          title="See the workflow that matches how you are measured."
          lead="One set of evidence, read five ways. We will walk through the one your team reports in."
          align="center"
        />
        <div className="flex flex-wrap justify-center gap-3">
          <DemoButtonLink size="marketing">{DEMO_CTA}</DemoButtonLink>
          <ButtonLink href="/pricing" variant="soft" size="marketing">
            See pricing
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
