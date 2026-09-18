'use client';

import { Check, ExternalLink, Minus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { panelClasses } from '@/components/ui/panel';
import { Label, textRole } from '@/components/ui/typography';
import { ledgerClasses } from '@/components/ui/workspace';
import type { SearchSurfaceEvidence, SurfaceEntity } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * What one Google AI Overview actually showed.
 *
 * The presence table is the point of this panel. Mentioned, linked and cited
 * are three INDEPENDENT observations — the answer text named you, an inline
 * link pointed at you, a root reference cited you — and they come apart in
 * both directions. A brand can be linked without being cited and cited
 * without being named. Collapsing them into one "appeared" column would
 * delete the finding a reader came here for, so each has its own column and
 * none is derived from another.
 */

/** Three states, because the surface has three, and only one is a finding. */
function presenceCaption(evidence: SearchSurfaceEvidence): string {
  if (evidence.aio_present === true) return 'Google showed an AI Overview for this search.';
  if (evidence.aio_present === false) return 'Google showed no AI Overview for this search.';
  return 'This search was never successfully retrieved, so nothing was observed.';
}

function SurfaceStat({
  label,
  value,
  hint,
}: Readonly<{ label: string; value: string; hint?: string }>) {
  return (
    <div className="border-border-subtle bg-well grid min-w-0 gap-0.5 rounded-[var(--radius-control)] border px-3 py-2.5">
      <span className="text-muted text-xs">{label}</span>
      <span className={textRole('bodyStrong', 'truncate')}>{value}</span>
      {hint ? <span className="text-muted truncate text-xs">{hint}</span> : null}
    </div>
  );
}

/** One yes/no cell. Never colour alone: the icon carries a text label too. */
function SignalCell({ present, label }: Readonly<{ present: boolean; label: string }>) {
  const Icon = present ? Check : Minus;
  return (
    <td className="px-3 py-2.5">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-sm',
          present ? 'text-score-high' : 'text-muted',
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">{label}: </span>
        {present ? 'Yes' : 'No'}
      </span>
    </td>
  );
}

function EntityRow({ entity }: Readonly<{ entity: SurfaceEntity }>) {
  return (
    <tr className="border-border-subtle border-t">
      <th scope="row" className="px-3 py-2.5 text-left">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={textRole('bodyStrong', 'truncate')}>{entity.name}</span>
          {entity.kind === 'brand' ? <Badge variant="neutral">Your brand</Badge> : null}
        </span>
      </th>
      <SignalCell present={entity.mentioned} label="Named in the answer" />
      <SignalCell present={entity.linked} label="Linked from the answer" />
      <SignalCell present={entity.cited} label="Cited in the references" />
      <td className="text-secondary px-3 py-2.5 text-sm">
        {/* Null is "never named", which is not last place, so it says so
            rather than taking a number one position behind everyone else. */}
        {entity.mention_order === null ? (
          <span className="text-muted">Not named</span>
        ) : (
          `#${entity.mention_order}`
        )}
      </td>
    </tr>
  );
}

function PresenceTable({ entities }: Readonly<{ entities: readonly SurfaceEntity[] }>) {
  if (entities.length === 0) {
    return (
      <div className="border-border-subtle text-muted rounded-[var(--radius-card)] border border-dashed p-4 text-center text-sm">
        No tracked brands were configured for this run.
      </div>
    );
  }
  return (
    <div className="border-border-subtle min-w-0 overflow-x-auto rounded-[var(--radius-card)] border">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr className="text-muted text-xs">
            <th scope="col" className="px-3 py-2">
              Brand
            </th>
            <th scope="col" className="px-3 py-2">
              Named
            </th>
            <th scope="col" className="px-3 py-2">
              Linked
            </th>
            <th scope="col" className="px-3 py-2">
              Cited
            </th>
            <th scope="col" className="px-3 py-2">
              Mention order
            </th>
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => (
            <EntityRow key={`${entity.kind}-${entity.name}`} entity={entity} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function safeLinkUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function InlineLinks({ links }: Readonly<{ links: SearchSurfaceEvidence['links'] }>) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <Label>Inline links</Label>
          <span className="text-muted text-xs">
            {links.length} {links.length === 1 ? 'link' : 'links'}
          </span>
        </div>
        <p className="text-muted text-xs">
          Links inside the overview&rsquo;s own text. Separate from its references, which are listed
          as citations.
        </p>
      </div>
      {links.length === 0 ? (
        <div className="border-border-subtle text-muted rounded-[var(--radius-card)] border border-dashed p-4 text-center text-sm">
          The overview&rsquo;s text carried no inline links.
        </div>
      ) : (
        <ul className={ledgerClasses('boxed')}>
          {links.map((link) => {
            const href = safeLinkUrl(link.url);
            const title = link.title || link.domain || link.url;
            return (
              // An overview can point at the same URL from two places in its
              // own text, so the URL alone is not unique among siblings. The
              // element it was drawn from is what separates them.
              <li key={`${link.element_index}-${link.url}`} className="grid gap-0.5 p-3.5">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={textRole(
                      'bodyStrong',
                      'hover:text-accent-text inline-flex max-w-full items-center gap-1.5 transition-colors hover:underline',
                    )}
                  >
                    <span className="truncate">{title}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <p className={textRole('bodyStrong', 'truncate')}>{title}</p>
                )}
                <p className="text-muted truncate text-xs">{link.domain}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * When Google captured the page, kept apart from when we collected it.
 *
 * The two differ by however long the task sat in the provider's queue, and a
 * reader comparing overviews across days needs the capture time, not ours.
 */
function SurfaceFooter({ evidence }: Readonly<{ evidence: SearchSurfaceEvidence }>) {
  return (
    <footer className="border-border-subtle text-muted flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs">
      <span>Captured {formatTimestamp(evidence.observed_at)}</span>
      <span>Retrieved {formatTimestamp(evidence.retrieved_at)}</span>
      <span>Location {evidence.location_code}</span>
      <span>{evidence.language_code}</span>
      <span>{evidence.device}</span>
    </footer>
  );
}

export function SurfaceEvidence({ evidence }: Readonly<{ evidence: SearchSurfaceEvidence }>) {
  const shown = evidence.aio_present === true;
  return (
    <section className="grid min-w-0 gap-[var(--workspace-gap)]">
      <div className="grid gap-0.5">
        <Label>AI Overview details</Label>
        <p className="text-muted text-xs">{presenceCaption(evidence)}</p>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <SurfaceStat
          label="Overview"
          value={shown ? 'Shown' : evidence.aio_present === false ? 'Not shown' : 'Not observed'}
        />
        <SurfaceStat
          label="Block position"
          value={
            evidence.aio_serp_position === null ? 'Not recorded' : `#${evidence.aio_serp_position}`
          }
          hint="On the results page"
        />
        <SurfaceStat label="Elements" value={String(evidence.element_count)} />
        <SurfaceStat label="References" value={String(evidence.reference_count)} />
      </div>
      {shown ? (
        <>
          <section className="grid gap-3">
            <div className="grid gap-0.5">
              <Label>Who appeared, and how</Label>
              <p className="text-muted text-xs">
                Three independent observations. A brand can be linked without being cited, and cited
                without being named.
              </p>
            </div>
            <PresenceTable entities={evidence.entities} />
          </section>
          <InlineLinks links={evidence.links} />
        </>
      ) : (
        <div
          className={panelClasses(
            { tone: 'well', pad: 'compact' },
            'text-secondary min-w-0 text-sm',
          )}
        >
          {evidence.aio_present === false
            ? 'There was nothing to compose: no overview appeared, so no brand could appear in one.'
            : 'No presence can be reported for a search that was never retrieved. This is a gap in our measurement, not an absence of the brand.'}
        </div>
      )}
      <SurfaceFooter evidence={evidence} />
    </section>
  );
}
