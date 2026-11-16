import { OpportunityKvRow } from '@/components/opportunities/opportunity-kv-row';
import { Inline, Stack } from '@/components/ui/layout';
import { OpportunitySourcePattern } from '@/components/opportunities/opportunity-source-pattern';
import { StatusMark } from '@/components/ui/status-mark';
import { ClampText } from '@/components/ui/clamp-text';
import { textRole } from '@/components/ui/typography';
import type { OpportunityDetail } from '@citeladder/contracts';
import { observedSourcePattern } from '@/lib/opportunities/source-pattern';
import { formatCount, readableUrl } from '@/lib/format';
import { keywordGapEvidenceSchema } from '@citeladder/contracts';
import { wellClasses } from '@/components/ui/slip';
import { UrlText } from '@/components/ui/table';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** A keyword gap: who ranks, where, and the provider estimate it rests on. */
function KeywordGapEvidence({ evidence }: Readonly<{ evidence: Record<string, unknown> }>) {
  // Evidence the gap detector did not write in this shape is left unstated, not guessed at.
  const parsed = keywordGapEvidenceSchema.safeParse(evidence);
  if (!parsed.success) return null;
  const { search_volume: volume, competitors, statement } = parsed.data;
  return (
    <Stack>
      {volume === null ? null : (
        <OpportunityKvRow
          label="Monthly searches (DataForSEO estimate)"
          value={formatCount(volume)}
        />
      )}
      <Stack as="ul" gap="tight" className="type-body text-ink-2">
        {competitors.map((item) => (
          <li key={item.row_id} className="min-w-0">
            <ClampText>
              {item.name} ranks
              {item.rank_group === null ? '' : ` #${item.rank_group}`}
              {item.url ? ` with ${readableUrl(item.url)}` : ''}
            </ClampText>
          </li>
        ))}
      </Stack>
      <p className="type-caption">{statement}</p>
    </Stack>
  );
}

function EvidenceHeading() {
  return <h3 className={textRole('subheading')}>Evidence</h3>;
}

/**
 * A finding's evidence. Its address shows only where it differs from the
 * Action's target (`targetUrl`), which the page already names.
 */
export function OpportunityEvidenceSection({
  detail,
  targetUrl = null,
}: Readonly<{ detail: OpportunityDetail; targetUrl?: string | null }>) {
  const evidence = detail.evidence;
  if (detail.rule_id === 'search_keyword_gap')
    return (
      <Stack as="section">
        <EvidenceHeading />
        {detail.target_theme ? (
          <OpportunityKvRow label="Search" value={detail.target_theme} />
        ) : null}
        <KeywordGapEvidence evidence={evidence} />
      </Stack>
    );
  const parts = evidenceParts(detail, targetUrl);
  if (!Object.values(parts).some(Boolean)) return null;
  const { promptText, url, theme, competitors, sourcePattern } = parts;

  return (
    <Stack as="section">
      <EvidenceHeading />
      {promptText ? (
        <blockquote className={wellClasses()}>
          <p className="type-body text-ink">“{promptText}”</p>
        </blockquote>
      ) : null}
      {url ? (
        <p className={wellClasses('min-w-0')}>
          <span className="type-body text-ink flex min-w-0">
            <UrlText url={url} />
          </span>
        </p>
      ) : null}
      {theme ? <OpportunityKvRow label="Topic" value={theme} /> : null}
      {competitors ? <CompetitorsMentioned names={competitors} /> : null}
      {sourcePattern ? <OpportunitySourcePattern pattern={sourcePattern} /> : null}
    </Stack>
  );
}

/** What a finding's evidence states, each part null when it states nothing new. */
function evidenceParts(detail: OpportunityDetail, targetUrl: string | null) {
  const { evidence } = detail;
  const found = asString(evidence.url) ?? detail.target_url;
  const competitors = asStringList(evidence.competitor_names);
  return {
    promptText: asString(evidence.prompt_text),
    url: found && targetUrl && readableUrl(found) === readableUrl(targetUrl) ? null : found,
    theme: asString(evidence.prompt_theme) ?? detail.target_theme,
    competitors: competitors.length > 0 ? competitors : null,
    sourcePattern: observedSourcePattern(evidence.source_pattern),
  };
}

function CompetitorsMentioned({ names }: Readonly<{ names: readonly string[] }>) {
  return (
    <Stack gap="tight">
      <span className="type-caption">Competitors mentioned</span>
      <Inline className="flex-wrap">
        {names.map((name) => (
          <StatusMark key={name} variant="classification" value="competitor">
            {name}
          </StatusMark>
        ))}
      </Inline>
    </Stack>
  );
}
