'use client';

import { ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses } from '@/components/ui/workspace';
import { ExecutionHeader } from '@/components/visibility/evidence-states';
import { classificationBadgeValue, classificationLabel } from '@/lib/runs/status';
import type { VisibilityExecutionEvidence } from '@/lib/api/types';
import { safeExternalUrl } from '@/lib/visibility/urls';

/**
 * One tracked answer, with the mentions and citations persisted against it.
 *
 * This was the Mentions & Citations tab's row. The tab is gone; the row is not,
 * because "show me the actual answers" is still asked in two places — a
 * domain's prompts and a URL's detail — and a second implementation of it
 * would be a second reading of the same evidence.
 *
 * It renders PERSISTED rows only, never inferred ones, and it does not render
 * a generated-query list: that belongs to Query fanouts.
 */
export function AnswerEvidenceRow({
  item,
  highlightUrl,
}: Readonly<{
  item: VisibilityExecutionEvidence;
  /** The source this answer was opened FROM, marked so it can be found. */
  highlightUrl?: string | null;
}>) {
  return (
    <li className="hover:bg-panel-tonal/40 grid gap-3 px-[var(--card-padding)] py-4 transition-colors">
      <div className={panelClasses({ tone: 'well', pad: 'compact' }, 'grid gap-1.5')}>
        <p className={textRole('body', 'leading-relaxed')}>
          {item.prompt_text || 'Untitled prompt'}
        </p>
        <ExecutionHeader item={item} />
      </div>

      {!item.mentions.length && !item.citations.length ? (
        <p className={textRole('meta', 'text-secondary')}>
          No tracked mentions or citations in this answer.
        </p>
      ) : null}

      {item.mentions.length > 0 ? (
        <div className="grid gap-1.5">
          <p className={eyebrowClasses}>Mentions</p>
          <div className="flex flex-wrap gap-1.5">
            {item.mentions.map((mention) => (
              <Badge
                key={`${mention.artifact_id ?? item.analysis_id}:${mention.analyzer_version}:${mention.kind}:${mention.name}:${mention.first_offset ?? 'na'}`}
                variant="classification"
                value={mention.kind === 'brand' ? 'owned' : 'competitor'}
              >
                {mention.name || (mention.kind === 'brand' ? 'Brand' : 'Competitor')}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {item.citations.length > 0 ? (
        <div className="grid gap-1.5">
          <p className={eyebrowClasses}>Citations</p>
          <ul className={ledgerClasses('boxed')}>
            {item.citations.map((citation) => (
              <CitationRow
                key={`${item.analysis_id}-${citation.ordinal}-${citation.url}`}
                citation={citation}
                highlighted={Boolean(highlightUrl) && citation.url === highlightUrl}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function CitationRow({
  citation,
  highlighted,
}: Readonly<{
  citation: VisibilityExecutionEvidence['citations'][number];
  highlighted: boolean;
}>) {
  const href = safeExternalUrl(citation.url);
  const label = citation.title?.trim() || citation.domain || citation.url;
  return (
    <li
      // The source the reader arrived from is tinted rather than moved: an
      // answer's citations are ordered as the engine produced them, and
      // reordering them to float one to the top would misreport the answer.
      className={`flex items-center justify-between gap-3 px-3 py-2 ${
        highlighted ? 'bg-accent-soft' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={textRole(
              'label',
              'hover:text-accent-text inline-flex max-w-full items-center gap-1.5 transition-colors hover:underline',
            )}
          >
            <span className="truncate">{label}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        ) : (
          <span className={textRole('label', 'block truncate')}>{label}</span>
        )}
        {citation.domain && citation.title ? (
          <span className="text-muted block truncate text-xs">{citation.domain}</span>
        ) : null}
      </div>
      <Badge
        className="shrink-0"
        variant="classification"
        value={classificationBadgeValue(citation.classification)}
      >
        {classificationLabel(citation.classification)}
      </Badge>
    </li>
  );
}
