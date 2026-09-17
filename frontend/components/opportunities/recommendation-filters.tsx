'use client';

import { OPPORTUNITY_STATUS_META } from '@/components/opportunities/opportunity-status-meta';
import { OpportunityFilterMenu } from '@/components/opportunities/opportunity-filter-menu';
import type { OpportunitySeverity, OpportunityStatus, OpportunityType } from '@/lib/api/types';
import { stringUrlCodec } from '@/lib/navigation/url-state';

/**
 * The opportunity queue's narrowings: the option sets, the URL codecs that
 * persist them, and the row of menus itself.
 *
 * They live apart from the catalog because they are read in two places now —
 * the control band draws them, the catalog's own filter hook decodes them —
 * and because the catalog had grown past its size ceiling holding both.
 */

export type TypeFilter = 'all' | OpportunityType;
export type SeverityFilter = 'all' | OpportunitySeverity;
export type StatusFilter = 'active' | OpportunityStatus;
export type PathFilter = 'all' | 'owned' | 'earned';

const TYPE_FILTERS: ReadonlyArray<{ key: TypeFilter; label: string }> = [
  { key: 'all', label: 'All types' },
  { key: 'visibility', label: 'Visibility' },
  { key: 'site', label: 'Site' },
  { key: 'traffic', label: 'Traffic' },
  { key: 'topic', label: 'Topic' },
];

const SEVERITY_FILTERS: ReadonlyArray<{ key: SeverityFilter; label: string }> = [
  { key: 'all', label: 'All impact levels' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'info', label: 'Informational' },
];

// Status labels come from the single source (evidence-drawer's meta record,
// in display order) so chips, the row dropdown, and the drawer never drift.
export const STATUS_CHOICES: ReadonlyArray<{
  value: OpportunityStatus;
  label: string;
}> = (Object.keys(OPPORTUNITY_STATUS_META) as OpportunityStatus[]).map((value) => ({
  value,
  label: OPPORTUNITY_STATUS_META[value].label,
}));

// The server's no-status-param default IS the active triage queue
// (open + in_progress), so the honest chip label is "Active".
const STATUS_FILTERS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'active', label: 'Active' },
  ...STATUS_CHOICES.map(({ value, label }) => ({ key: value, label })),
];
const PATH_FILTERS: ReadonlyArray<{ key: PathFilter; label: string }> = [
  { key: 'all', label: 'All paths' },
  { key: 'owned', label: 'Owned' },
  { key: 'earned', label: 'Earned' },
];
export const typeCodec = stringUrlCodec(
  TYPE_FILTERS.map(({ key }) => key),
  'all',
);
export const severityCodec = stringUrlCodec(
  SEVERITY_FILTERS.map(({ key }) => key),
  'all',
);
export const statusCodec = stringUrlCodec(
  STATUS_FILTERS.map(({ key }) => key),
  'active',
);
export const pathCodec = stringUrlCodec(
  PATH_FILTERS.map(({ key }) => key),
  'all',
);

/**
 * The queue's four narrowings. They used to hang off the section header's
 * action slot, which put the page's only filters at the reader's third rule
 * rather than its first. They are page filters, so they are the control band.
 */
export function RecommendationFilters({
  pathFilter,
  onPathChange,
  typeFilter,
  onTypeChange,
  severityFilter,
  onSeverityChange,
  statusFilter,
  onStatusChange,
}: Readonly<{
  pathFilter: PathFilter;
  onPathChange: (value: PathFilter) => void;
  typeFilter: TypeFilter;
  onTypeChange: (value: TypeFilter) => void;
  severityFilter: SeverityFilter;
  onSeverityChange: (value: SeverityFilter) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
}>) {
  return (
    <fieldset className="contents" aria-label="Recommendation filters">
      <OpportunityFilterMenu
        label="Path"
        value={pathFilter}
        options={PATH_FILTERS}
        onChange={onPathChange}
      />
      <OpportunityFilterMenu
        label="Area"
        value={typeFilter}
        options={TYPE_FILTERS}
        onChange={onTypeChange}
      />
      <OpportunityFilterMenu
        label="Impact"
        value={severityFilter}
        options={SEVERITY_FILTERS}
        onChange={onSeverityChange}
      />
      <OpportunityFilterMenu
        label="Status"
        value={statusFilter}
        options={STATUS_FILTERS}
        onChange={onStatusChange}
      />
    </fieldset>
  );
}
