import type { ChangeObservation } from '@citeladder/contracts';

import { CopyButton } from '@/components/ui/copy-button';
import { Drawer } from '@/components/ui/drawer';
import { Inline } from '@/components/ui/layout';
import { PageLink } from '@/components/site-health/page-link';
import { Text } from '@/components/ui/typography';
import { TreeBranch } from '@/components/ui/workspace';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';
import {
  CHANGE_EVIDENCE_DEPTH_LIMIT,
  CHANGE_EVIDENCE_LIMIT,
  CHANGE_EVIDENCE_TEXT_LIMIT,
} from '@/lib/config/site-health';
import { changeFieldLabel } from '@/lib/site-health/change-fields';
import { pluralCount } from '@/lib/format';

function boundedText(value: string) {
  return value.length > CHANGE_EVIDENCE_TEXT_LIMIT
    ? `${value.slice(0, CHANGE_EVIDENCE_TEXT_LIMIT)}…`
    : value;
}

function ChangeValue({ value, depth = 0 }: Readonly<{ value: unknown; depth?: number }>) {
  if (value === null || value === undefined || value === '') return <>Not present</>;
  if (Array.isArray(value)) {
    if (!value.length) return <>0 items</>;
    if (depth >= CHANGE_EVIDENCE_DEPTH_LIMIT) return <>{pluralCount(value.length, 'item')}</>;
    return (
      <TreeBranch>
        {value.slice(0, CHANGE_EVIDENCE_LIMIT).map((item, index) => (
          <li
            key={index} // NOSONAR
          >
            <ChangeValue value={item} depth={depth + 1} />
          </li>
        ))}
        {value.length > CHANGE_EVIDENCE_LIMIT ? (
          <Text as="li" variant="body" tone="ink-2">
            {value.length - CHANGE_EVIDENCE_LIMIT} more items not shown
          </Text>
        ) : null}
      </TreeBranch>
    );
  }
  if (typeof value === 'object') return <ChangeRecord value={value} depth={depth} />;
  const text = scalarText(value);
  return text === null ? <>Not present</> : <>{boundedText(text)}</>;
}

function scalarText(value: unknown): string | null {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return null;
  }
}

const CONTENT_FIELD_ORDER = [
  'content_change_classification',
  'content_delta_ratio',
  'comparison_coverage',
  'coverage_reason',
  'sections_added',
  'sections_removed',
  'heading_outline',
  'word_count',
];

const CONTENT_STATE_FIELDS = new Set([
  'content_change_classification',
  'metadata_consistency',
  'comparison_coverage',
  'coverage',
  'coverage_reason',
  'content_delta_measure',
]);

function changeFieldValue(key: string, value: unknown) {
  if (typeof value !== 'string' || !CONTENT_STATE_FIELDS.has(key)) return value;
  return changeFieldLabel(value);
}

function ChangeRecord({ value, depth }: Readonly<{ value: object; depth: number }>) {
  const fields = Object.entries(value);
  if (!fields.length) return <>Not present</>;
  if (depth >= CHANGE_EVIDENCE_DEPTH_LIMIT) return <>{pluralCount(fields.length, 'field')}</>;
  const rank = (key: string) => {
    const index = CONTENT_FIELD_ORDER.indexOf(key);
    return index < 0 ? CONTENT_FIELD_ORDER.length : index;
  };
  fields.sort(([left], [right]) => rank(left) - rank(right));
  return (
    <TreeBranch as="dl">
      {fields.slice(0, CHANGE_EVIDENCE_LIMIT).map(([key, item]) => (
        <div key={key}>
          <Text as="dt" variant="body" tone="ink-2" box="inline">
            {boundedText(changeFieldLabel(key))}:{' '}
          </Text>
          <Text as="dd" variant="body" tone="ink-2" box="inline" wrap="anywhere">
            {key === 'shingles' && Array.isArray(item) ? (
              `${item.length} text fingerprints`
            ) : (
              <ChangeValue value={changeFieldValue(key, item)} depth={depth + 1} />
            )}
          </Text>
        </div>
      ))}
      {fields.length > CHANGE_EVIDENCE_LIMIT ? (
        <div>
          <dt className="sr-only">Additional evidence</dt>
          <Text as="dd" variant="body" tone="ink-2">
            {fields.length - CHANGE_EVIDENCE_LIMIT} more fields not shown
          </Text>
        </div>
      ) : null}
    </TreeBranch>
  );
}

function EvidenceValue({ heading, value }: Readonly<{ heading: string; value: unknown }>) {
  return (
    <Section aria-label={heading}>
      <SectionHeader>
        <SectionTitle>{heading}</SectionTitle>
      </SectionHeader>
      <Text as="div" variant="body" tone="ink-2" wrap="anywhere">
        <ChangeValue value={value} />
      </Text>
    </Section>
  );
}

function EvidenceSources({
  row,
  crawlAId,
  crawlBId,
}: Readonly<{ row: ChangeObservation; crawlAId: string | null; crawlBId: string | null }>) {
  return (
    <Section aria-label="Page evidence">
      <SectionHeader>
        <SectionTitle>Page evidence</SectionTitle>
      </SectionHeader>
      <Inline wrap>
        {crawlAId && row.source_analysis_a_id ? (
          <PageLink text="body" crawlId={crawlAId} siteUrlId={row.site_url_id}>
            Previous crawl
          </PageLink>
        ) : (
          <Text variant="caption">Previous crawl: no page evidence</Text>
        )}
        {crawlBId && row.source_analysis_b_id ? (
          <PageLink text="body" crawlId={crawlBId} siteUrlId={row.site_url_id}>
            Latest crawl
          </PageLink>
        ) : (
          <Text variant="caption">Latest crawl: no page evidence</Text>
        )}
      </Inline>
      {row.implementation_event_id ? (
        <Inline>
          <Text variant="caption">Matches a declared implementation</Text>
          <CopyButton variant="quiet" value={row.implementation_event_id}>
            Copy event ID
          </CopyButton>
        </Inline>
      ) : null}
    </Section>
  );
}

export function ChangeEvidenceDrawer({
  row,
  crawlAId,
  crawlBId,
  onClose,
}: Readonly<{
  row: ChangeObservation | undefined;
  crawlAId: string | null;
  crawlBId: string | null;
  onClose: () => void;
}>) {
  return (
    <Drawer
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Change evidence"
    >
      {row ? (
        <>
          <EvidenceValue heading="Before" value={row.before_value} />
          <EvidenceValue heading="After" value={row.after_value} />
          <EvidenceSources row={row} crawlAId={crawlAId} crawlBId={crawlBId} />
        </>
      ) : null}
    </Drawer>
  );
}
