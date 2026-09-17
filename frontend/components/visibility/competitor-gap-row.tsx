'use client';

import { ExternalLink } from 'lucide-react';
import type { z } from 'zod';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OnPageEntities } from '@/components/ui/on-page-entities';
import { Limitations } from '@/components/ui/passage';
import { textRole } from '@/components/ui/typography';
import type { competitorPageSchema } from '@/lib/api/schemas/source-pages';
import { absenceBasis, citedByLabel, pageFormatLabel } from '@/lib/visibility/source-pages';
import { safeExternalUrl } from '@/lib/visibility/urls';

export type CompetitorGapPage = z.infer<typeof competitorPageSchema>;

/**
 * One page where rivals appear and the brand does not — the whole finding, on
 * screen, with nothing behind a click.
 *
 * Everything the question needs is here: who is on the page, the quoted line
 * proving it, what kind of page it is, how many answers cited it, and the
 * action. The page detail and the inspect command are refinement, reachable
 * from the title, and are never the only route to the evidence.
 */
export function CompetitorGapRow({
  page,
  onOpenPage,
}: Readonly<{ page: CompetitorGapPage; onOpenPage: (urlHash: string) => void }>) {
  const format = pageFormatLabel(page.page_format);
  return (
    <li className="grid gap-2.5 px-[var(--card-padding)] py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          onClick={() => onOpenPage(page.url_hash)}
        >
          <span className="max-w-120 truncate">{page.title || page.canonical_url}</span>
        </Button>
        <span className={textRole('meta')}>{citedByLabel(page.answers_citing)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={textRole('meta')}>{page.registrable_domain}</span>
        {format ? <Badge variant="neutral">{format}</Badge> : null}
        <PageSourceLink url={page.canonical_url} />
      </div>
      <OnPageEntities heading="On this page" entities={page.competitors} />
      <BrandVerdict page={page} />
      <PageAction page={page} />
      <Limitations items={page.limitations} />
    </li>
  );
}

function PageSourceLink({ url }: Readonly<{ url: string }>) {
  const href = safeExternalUrl(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={textRole(
        'meta',
        'hover:text-accent-text inline-flex items-center gap-1 transition-colors hover:underline',
      )}
    >
      Open page
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  );
}

/**
 * Where the brand stands on this page, and on what basis.
 *
 * An absence carries the matching method and the extraction coverage instead
 * of a passage, because no passage can demonstrate one.
 */
function BrandVerdict({ page }: Readonly<{ page: CompetitorGapPage }>) {
  const basis = absenceBasis(page.brand_state, page.brand_match_method, page.extracted_chars);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className={textRole('bodyStrong')}>You are not on this page.</span>
      {basis ? <span className={textRole('meta')}>{basis}</span> : null}
    </div>
  );
}

/**
 * The route to the work, or an honest statement that there is none yet.
 *
 * Only a qualified rule produces an action. "No action yet" is a real answer
 * and is not papered over with a generic suggestion to improve something.
 */
function PageAction({ page }: Readonly<{ page: CompetitorGapPage }>) {
  if (!page.opportunity_id) {
    return <span className={textRole('meta')}>No action yet</span>;
  }
  return (
    <Button asChild size="sm" variant="secondary" className="justify-self-start">
      <ProjectLink href={`/opportunities?selected=${page.opportunity_id}`}>
        {page.opportunity_title || 'Open opportunity'}
      </ProjectLink>
    </Button>
  );
}
