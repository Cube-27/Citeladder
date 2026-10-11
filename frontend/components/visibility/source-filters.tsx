'use client';

import { FilterChoice } from '@/components/ui/filter-row';

/** Narrows every table on the tab to one publisher. */
export function DomainFilter({
  value,
  options,
  onChange,
}: Readonly<{
  value: string | null;
  options: readonly string[];
  onChange: (value: string | null) => void;
}>) {
  // As in `TypeFilter`: a control that is currently filtering must stay, or
  // there is no way back to "All domains".
  if (options.length < 2 && !value) return null;
  return (
    <FilterChoice
      label="Filter by domain"
      value={value ?? 'all'}
      options={[
        { value: 'all', label: 'All domains' },
        ...options.map((entry) => ({ value: entry, label: entry })),
      ]}
      onChange={(next) => onChange(next === 'all' ? null : next)}
    />
  );
}

/**
 * Narrows the URL table to gaps: pages whose latest reading lists a tracked
 * competitor and not you. A page nobody has read is never a gap.
 */
export function GapFilter({
  value,
  onChange,
}: Readonly<{ value: boolean; onChange: (gapOnly: boolean) => void }>) {
  return (
    <FilterChoice
      label="Filter by standing"
      value={value ? 'gap' : 'all'}
      options={[
        { value: 'all', label: 'All pages' },
        { value: 'gap', label: 'Gaps: competitors listed, not you' },
      ]}
      onChange={(next) => onChange(next === 'gap')}
    />
  );
}

/** Narrows the table to one domain type, or one URL type. */
export function TypeFilter({
  dimension,
  value,
  options,
  onChange,
}: Readonly<{
  dimension: 'domain' | 'url';
  value: string | null;
  options: readonly { token: string; label: string }[];
  onChange: (value: string | null) => void;
}>) {
  // One option is nothing to choose between -- unless a filter is already
  // applied, in which case removing the control strands the reader inside it.
  if (options.length < 2 && !value) return null;
  const urls = dimension === 'url';
  return (
    <FilterChoice
      label={urls ? 'Filter by URL type' : 'Filter by domain type'}
      value={value ?? 'all'}
      options={[
        { value: 'all', label: urls ? 'All URL types' : 'All domain types' },
        ...options.map((type) => ({ value: type.token, label: type.label })),
      ]}
      onChange={(next) => onChange(next === 'all' ? null : next)}
    />
  );
}
