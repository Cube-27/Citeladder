import Link from 'next/link';

import { OpportunityKvRow } from '@/components/opportunities/opportunity-kv-row';
import { Label } from '@/components/ui/typography';
import type { OpportunityDetail } from '@/lib/api/types';
import { formatAudited } from '@/lib/site-health/status';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** One deep-link row in the Source list (label + accent link, like the tables). */
function SourceLink({
  label,
  href,
  linkText,
}: Readonly<{ label: string; href: string; linkText: string }>) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-2xs text-muted shrink-0">{label}</span>
      <Link href={href} className="text-accent-text text-sm font-medium hover:underline">
        {linkText}
      </Link>
    </div>
  );
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Source + priority + detection-version provenance (C2).
 *
 * The detail DTO already carries the full provenance bundle — this section
 * renders it: deep-links into the evidence surface that produced the row
 * (visibility run, Site Health page detail, prompt library), the source-row
 * counts, the deterministic priority score with a plain-language note on its
 * inputs, and the analyzer/rule/formula version tokens (invariant 4).
 */
export function OpportunitySummarySection({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  const evidence = detail.evidence;
  const auditId = asString(evidence.audit_id);
  const crawlId = asString(evidence.crawl_id);
  const siteUrlId = asString(evidence.site_url_id);

  const sourceCounts: string[] = [];
  if (detail.source_analysis_ids.length > 0) {
    sourceCounts.push(pluralize(detail.source_analysis_ids.length, 'analysis', 'analyses'));
  }
  if (detail.source_issue_ids.length > 0) {
    sourceCounts.push(pluralize(detail.source_issue_ids.length, 'site issue', 'site issues'));
  }
  if (detail.source_metric_ids.length > 0) {
    sourceCounts.push(
      pluralize(detail.source_metric_ids.length, 'metric snapshot', 'metric snapshots'),
    );
  }
  if (detail.source_traffic_ids.length > 0) {
    sourceCounts.push(pluralize(detail.source_traffic_ids.length, 'traffic row', 'traffic rows'));
  }

  return (
    <>
      <section className="grid gap-2">
        <Label>Source</Label>
        <div className="divide-border-subtle divide-y">
          <OpportunityKvRow label="Detected" value={formatAudited(detail.created_at)} />
          {auditId ? (
            <SourceLink label="Visibility run" href={`/runs/${auditId}`} linkText="View run" />
          ) : null}
          {crawlId && siteUrlId ? (
            <SourceLink
              label="Site page"
              href={`/site-health/crawls/${crawlId}/pages/${siteUrlId}`}
              linkText="View page detail"
            />
          ) : null}
          {detail.target_prompt_id ? (
            <SourceLink label="Prompt" href="/prompts" linkText="Open prompt library" />
          ) : null}
          {sourceCounts.length > 0 ? (
            <OpportunityKvRow label="Evidence rows" value={sourceCounts.join(' · ')} />
          ) : null}
        </div>
      </section>
      <section className="grid gap-2">
        <Label>Priority</Label>
        <div className="border-border-subtle bg-background-alt rounded-lg border p-3">
          <p className="text-foreground text-sm">
            Priority score <span className="mono font-semibold">{detail.priority_score}</span>
          </p>
          <p className="text-muted mt-1 text-xs">
            Set by a deterministic formula: impact weight × target value (prompt intent) × evidence
            gap (competitor pressure and missing owned citations), scaled ×10. The same evidence and
            the same formula version always produce the same score.
          </p>
        </div>
      </section>
      <section className="grid gap-2">
        <Label>Detection</Label>
        <div className="divide-border-subtle divide-y">
          <OpportunityKvRow label="Analyzer version" value={detail.analyzer_version} />
          <OpportunityKvRow label="Rule version" value={detail.rule_version} />
          <OpportunityKvRow label="Formula version" value={detail.formula_version} />
        </div>
      </section>
    </>
  );
}
