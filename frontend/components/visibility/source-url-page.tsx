'use client';

import type { z } from 'zod';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { OnPageEntities } from '@/components/ui/on-page-entities';
import { Passage } from '@/components/ui/passage';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import type { visibilitySourceUrlSchema } from '@citeladder/contracts/visibility-evidence';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { formatCount } from '@/lib/format';
import {
  absenceBasis,
  pageStanding,
  presenceLabel,
  standingSentence,
} from '@/lib/visibility/source-pages';
import { sinceLabel } from '@/lib/visibility/sources';
import { pageFormatBasis, urlTypeLabel } from '@/lib/visibility/vocabulary';

type Page = z.infer<typeof visibilitySourceUrlSchema>['page'];
type Entity = NonNullable<Page>['entities'][number];

/**
 * What the business can do about one cited page, and what the page says.
 *
 * It leads with where the business stands — listed, absent beside listed
 * competitors, or not judged yet and why — because that decides whether
 * there is anything to do. Every name shown as on the page carries the line
 * that proves it; a page nobody read shows no verdicts at all.
 */
export function SourceUrlPageCard({
  url,
  page,
  loading,
}: Readonly<{ url: string; page: Page | undefined; loading: boolean }>) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (page === undefined) return null;
  const standing = pageStanding(page);
  const competitors = (page?.entities ?? []).filter(
    (entity) => entity.kind === 'competitor' && entity.presence === 'present',
  );
  const brand = page?.entities.find((entity) => entity.kind === 'brand') ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>On this page</CardTitle>
        <CardDescription>{standingSentence(standing)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {standing === 'gap' ? <GetListed url={url} actionId={page?.action_id ?? null} /> : null}
        <OnPageEntities
          heading={standing === 'gap' ? 'Listed here' : 'Competitors on this page'}
          entities={competitors.map((entity) => ({
            entity_name: entity.name,
            passages: entity.passages,
          }))}
        />
        {brand && page?.read_at ? (
          <BrandVerdict brand={brand} extractedChars={page.extracted_chars ?? 0} />
        ) : null}
        {page ? <PageFacts page={page} /> : null}
      </CardContent>
    </Card>
  );
}

/**
 * The two ways to act on the gap. An open Action carries the brief and the
 * measurement; before one exists (the page is not yet cited often enough),
 * the Agent can still draft the request from the page itself.
 */
function GetListed({ url, actionId }: Readonly<{ url: string; actionId: string | null }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actionId ? (
        <>
          <Button size="sm" asChild>
            <ProjectLink href={`/agent/actions/${actionId}`}>Open the Action</ProjectLink>
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <ProjectLink href={agentHandoffHref({ actionId })}>Draft the request</ProjectLink>
          </Button>
        </>
      ) : (
        <Button size="sm" variant="secondary" asChild>
          <ProjectLink
            href={agentHandoffHref({
              targetUrl: url,
              skillId: 'earned_authority',
              prompt: 'Draft a request to be listed on this page alongside the competitors on it.',
            })}
          >
            Draft a request to be listed
          </ProjectLink>
        </Button>
      )}
    </div>
  );
}

/**
 * Where the business stands on the page. A presence carries its passage; an
 * absence carries how much was searched and how, because no passage can show
 * that something is missing.
 */
function BrandVerdict({
  brand,
  extractedChars,
}: Readonly<{ brand: Entity; extractedChars: number }>) {
  const verdict = presenceLabel(brand.presence);
  const basis = absenceBasis(brand.presence, brand.match_method, extractedChars);
  return (
    <div className="grid gap-2">
      <p className={eyebrowClasses}>You</p>
      <p className={textRole('itemTitle')}>
        {brand.name}
        {verdict ? ` — ${verdict.toLowerCase()}` : ''}
      </p>
      {brand.passages.map((passage) => (
        <Passage key={passage}>{passage}</Passage>
      ))}
      {basis ? <p className="type-caption">{basis}</p> : null}
    </div>
  );
}

/** When it was read, how much of it, and what kind of page it is by what evidence. */
function PageFacts({ page }: Readonly<{ page: NonNullable<Page> }>) {
  const read = sinceLabel(page.read_at);
  const type = urlTypeLabel(page.page_format);
  const basis = pageFormatBasis(page.page_format_method);
  const facts = [
    read
      ? `Read ${read.toLowerCase()}${page.extracted_chars ? `, ${formatCount(page.extracted_chars)} characters readable` : ''}.`
      : null,
    type && page.page_format !== 'unresolved'
      ? `Page type: ${type}${basis ? ` (${basis.charAt(0).toLowerCase()}${basis.slice(1)})` : ''}.`
      : 'What kind of page this is could not be established.',
  ].filter(Boolean);
  return (
    <div className="grid gap-1">
      {facts.map((fact) => (
        <p key={fact} className="type-caption">
          {fact}
        </p>
      ))}
    </div>
  );
}
