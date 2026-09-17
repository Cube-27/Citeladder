'use client';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { panelClasses } from '@/components/ui/panel';
import { Label, textRole } from '@/components/ui/typography';
import type { OpportunityDetail } from '@/lib/api/types';
import {
  brandVerdict,
  coverageSentence,
  deteriorationLabels,
  discrepancyLabels,
  onPageCompetitors,
  ruleIntent,
  unmetLabels,
  type HandoffPageEntity,
} from '@/lib/opportunities/earned-page';
import { absenceBasis, pageFormatLabel, presenceLabel } from '@/lib/visibility/source-pages';

/**
 * The evidence behind one earned-page action, on the screen where the decision
 * is made.
 *
 * All of this was already fetched and validated and then thrown away: the
 * drawer rendered one sentence and a button over a brief that carries the
 * competitors found on the page, the passages proving it, the page format, the
 * extraction coverage, the named discrepancy or deterioration, and what is
 * still unresolved.
 *
 * Two sets of names appear here and they never merge. `observed_competitors`
 * were found ON the page and each carries its quoted line; `answer_competitors`
 * were merely named in an answer that cited it, are labelled as such, and never
 * affected this task's priority.
 */
export function EarnedPageHandoff({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  const handoff = detail.content_handoff;
  const intent = ruleIntent(handoff.rule_id);
  const format = handoff.page_format ? pageFormatLabel(handoff.page_format) : null;
  return (
    <section className="grid gap-2">
      <Label>Action handoff</Label>
      <div className={panelClasses({ pad: 'compact' }, 'grid gap-3')}>
        <p className={textRole('body')}>
          {intent ??
            `Prepare a human-led earned asset for ${handoff.canonical_domain ?? 'the cited source'}.`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {handoff.canonical_domain ? (
            <Badge variant="neutral">{handoff.canonical_domain}</Badge>
          ) : null}
          {format ? <Badge variant="neutral">{format}</Badge> : null}
        </div>
        <FindingList
          heading="Specifically wrong"
          items={discrepancyLabels(handoff.discrepancies)}
        />
        <FindingList heading="What changed" items={deteriorationLabels(handoff.deterioration)} />
        <FindingList heading="Still unresolved" items={unmetLabels(handoff.unmet_qualification)} />
        <OnPage handoff={handoff} />
        <Brand handoff={handoff} />
        <NamedInAnswers names={handoff.answer_competitors} />
        <Coverage handoff={handoff} />
        {handoff.limitations.map((limitation) => (
          <p key={limitation} className="text-muted text-xs">
            {limitation}
          </p>
        ))}
        <Button asChild size="sm" className="justify-self-start">
          <ProjectLink href={`/content?opportunity_id=${detail.id}`}>
            Prepare earned content
          </ProjectLink>
        </Button>
        <LinkedGenerations detail={detail} />
      </div>
    </section>
  );
}

function FindingList({ heading, items }: Readonly<{ heading: string; items: string[] }>) {
  if (!items.length) return null;
  return (
    <div className="grid gap-1">
      <p className={eyebrowClasses}>{heading}</p>
      {items.map((item) => (
        <p key={item} className={textRole('body')}>
          {item}
        </p>
      ))}
    </div>
  );
}

/** The rivals on the publisher's page, each with the line that proves it. */
function OnPage({ handoff }: Readonly<{ handoff: OpportunityDetail['content_handoff'] }>) {
  const competitors = onPageCompetitors(handoff.page_entities);
  if (!competitors.length) return null;
  return (
    <div className="grid gap-1.5">
      <p className={eyebrowClasses}>Found on this page</p>
      <div className="flex flex-wrap gap-1.5">
        {competitors.map((entity) => (
          <Badge key={entity.entity_name} variant="classification" value="competitor">
            {entity.entity_name}
          </Badge>
        ))}
      </div>
      {competitors.map((entity) =>
        entity.passages.map((passage) => (
          <blockquote
            key={`${entity.entity_name}:${passage}`}
            className={panelClasses({ tone: 'well', pad: 'compact' })}
          >
            <p className={textRole('body', 'leading-relaxed')}>“{passage}”</p>
          </blockquote>
        )),
      )}
    </div>
  );
}

/**
 * Where the brand stands on the page.
 *
 * A presence carries its passage. A non-detection carries the matching method
 * and the extraction coverage instead, because no passage can demonstrate an
 * absence — printing one that looked like proof would be the failure this
 * shape exists to prevent.
 */
function Brand({ handoff }: Readonly<{ handoff: OpportunityDetail['content_handoff'] }>) {
  const brand = brandVerdict(handoff.page_entities);
  if (!brand) return null;
  return (
    <div className="grid gap-1.5">
      <p className={eyebrowClasses}>You on this page</p>
      <BrandLine brand={brand} extractedChars={handoff.extracted_chars ?? 0} />
    </div>
  );
}

function BrandLine({
  brand,
  extractedChars,
}: Readonly<{ brand: HandoffPageEntity; extractedChars: number }>) {
  const verdict = presenceLabel(brand.presence);
  const basis = absenceBasis(brand.presence, brand.match_method, extractedChars);
  return (
    <>
      <p className={textRole('bodyStrong')}>
        {brand.entity_name}
        {verdict ? ` — ${verdict.toLowerCase()}` : ''}
      </p>
      {brand.passages.map((passage) => (
        <blockquote key={passage} className={panelClasses({ tone: 'well', pad: 'compact' })}>
          <p className={textRole('body', 'leading-relaxed')}>“{passage}”</p>
        </blockquote>
      ))}
      {basis ? <p className="text-muted text-xs">{basis}</p> : null}
    </>
  );
}

/**
 * Competitors merely NAMED in an answer that cited this page.
 *
 * Kept visibly apart from the on-page findings and stated as what it is. This
 * set attaches every name in an answer to every page that answer cited, which
 * is exactly why it never scored anything.
 */
function NamedInAnswers({ names }: Readonly<{ names?: string[] }>) {
  if (!names?.length) return null;
  return (
    <div className="grid gap-1.5">
      <p className={eyebrowClasses}>Named in the answers, not on the page</p>
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <Badge key={name} variant="neutral">
            {name}
          </Badge>
        ))}
      </div>
      <p className="text-muted text-xs">
        These appeared somewhere in an answer that cited this page. They are not a finding about the
        page and did not affect this task&apos;s priority.
      </p>
    </div>
  );
}

function Coverage({ handoff }: Readonly<{ handoff: OpportunityDetail['content_handoff'] }>) {
  const sentence = coverageSentence(handoff.extracted_chars, handoff.sufficient_coverage);
  const frequency = handoff.observed_citation_frequency;
  if (!sentence && !frequency) return null;
  return (
    <div className="grid gap-1">
      <p className={eyebrowClasses}>Coverage</p>
      {sentence ? <p className={textRole('meta')}>{sentence}</p> : null}
      {frequency ? (
        <p className={textRole('meta')}>
          Cited by {frequency.answers_citing_page} of {frequency.eligible_answers} analyzed answers.
        </p>
      ) : null}
    </div>
  );
}

function LinkedGenerations({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  const count = detail.linked_generations.length;
  if (count === 0) return null;
  return (
    <p className="text-muted text-xs">
      {count} linked {count === 1 ? 'generation' : 'generations'}
    </p>
  );
}
