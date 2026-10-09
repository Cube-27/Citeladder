'use client';

import { Badge } from '@/components/ui/badge';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { OnPageEntities } from '@/components/ui/on-page-entities';
import { panelClasses } from '@/components/ui/panel';
import { Limitations, Passage } from '@/components/ui/passage';
import { Label, textRole } from '@/components/ui/typography';
import type { OpportunityDetail } from '@/lib/api/types';
import {
  brandVerdict,
  coverageSentence,
  onPageCompetitors,
  type HandoffPageEntity,
} from '@/lib/opportunities/earned-page';
import { absenceBasis, presenceLabel } from '@/lib/visibility/source-pages';
import { sinceLabel } from '@/lib/visibility/sources';
import { urlTypeLabel } from '@/lib/visibility/vocabulary';

type Handoff = OpportunityDetail['content_handoff'];

/**
 * The evidence behind one earned-page action, on the screen where the decision
 * is made: what to ask the publisher for, the competitors found on the page
 * with the line that proves each, where the brand stands, and the prompts
 * whose visibility is measured once the work is declared.
 *
 * Two sets of names appear here and they never merge. Competitors found ON
 * the page each carry their quoted line; `answer_competitors` were merely
 * named in an answer that cited it, are labelled as such, and never affected
 * this task's priority.
 */
export function EarnedPageHandoff({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  const handoff = detail.content_handoff;
  const format = urlTypeLabel(handoff.page_format);
  return (
    <section className="grid gap-2">
      <Label>Action handoff</Label>
      <div className={panelClasses({ pad: 'compact' }, 'grid gap-3')}>
        <p className={textRole('body')}>
          Get listed on this page. Competitors are on it and you are not.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {handoff.canonical_domain ? (
            <Badge variant="neutral">{handoff.canonical_domain}</Badge>
          ) : null}
          {format ? <Badge variant="neutral">{format}</Badge> : null}
        </div>
        {handoff.ask ? (
          <div className="grid gap-1">
            <p className={eyebrowClasses}>What to ask for</p>
            <p className={textRole('body')}>{handoff.ask}</p>
          </div>
        ) : null}
        <OnPageEntities
          heading="Found on this page"
          entities={onPageCompetitors(handoff.page_entities)}
        />
        <Brand handoff={handoff} />
        <Prompts prompts={handoff.affected_prompts} />
        <NamedInAnswers names={handoff.answer_competitors} />
        <Coverage handoff={handoff} />
        <Limitations items={handoff.limitations} />
      </div>
    </section>
  );
}

/**
 * Where the brand stands on the page.
 *
 * A presence carries its passage. A non-detection carries the matching method
 * and the extraction coverage instead, because no passage can demonstrate an
 * absence.
 */
function Brand({ handoff }: Readonly<{ handoff: Handoff }>) {
  const brand = brandVerdict(handoff.page_entities);
  if (!brand) return null;
  return (
    <div className="grid gap-2">
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
      <p className={textRole('itemTitle')}>
        {brand.entity_name}
        {verdict ? ` — ${verdict.toLowerCase()}` : ''}
      </p>
      {brand.passages.map((passage) => (
        <Passage key={passage}>{passage}</Passage>
      ))}
      {basis ? <p className="type-caption">{basis}</p> : null}
    </>
  );
}

/** The tracked prompts whose answers cited the page: what declaring the work measures. */
function Prompts({ prompts }: Readonly<{ prompts?: Handoff['affected_prompts'] }>) {
  if (!prompts?.length) return null;
  return (
    <div className="grid gap-1">
      <p className={eyebrowClasses}>Prompts that cite this page</p>
      <ul className="grid gap-1">
        {prompts.map((prompt) => (
          <li key={prompt.prompt_id} className={textRole('body')}>
            {prompt.text}
          </li>
        ))}
      </ul>
      <p className="type-caption">
        Once you mark this done, visibility on these prompts is measured after the next runs.
      </p>
    </div>
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
    <div className="grid gap-2">
      <p className={eyebrowClasses}>Named in the answers, not on the page</p>
      <div className="flex flex-wrap gap-2">
        {names.map((name) => (
          <Badge key={name} variant="neutral">
            {name}
          </Badge>
        ))}
      </div>
      <p className="type-caption">
        These appeared somewhere in an answer that cited this page. They are not a finding about the
        page and did not affect this task&apos;s priority.
      </p>
    </div>
  );
}

function Coverage({ handoff }: Readonly<{ handoff: Handoff }>) {
  const sentence = coverageSentence(handoff.extracted_chars);
  const read = sinceLabel(handoff.read_at);
  const frequency = handoff.observed_citation_frequency;
  if (!sentence && !frequency) return null;
  return (
    <div className="grid gap-1">
      <p className={eyebrowClasses}>Coverage</p>
      {sentence ? (
        <p className={textRole('caption')}>
          {read ? `Read ${read.toLowerCase()}. ` : ''}
          {sentence}
        </p>
      ) : null}
      {frequency ? (
        <p className={textRole('caption')}>
          Cited by {frequency.answers_citing_page} of {frequency.eligible_answers} analyzed answers.
        </p>
      ) : null}
    </div>
  );
}
