'use client';

import { Check, Filter, Sparkles, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { SearchField } from '@/components/ui/search-field';
import { intentLabels, intentValues } from '@/lib/prompts/forms';
import type { EnabledFilter, PromptFilters } from '@/lib/prompts/filter';
import { textRole } from '@/components/ui/typography';

/**
 * The prompt library's narrowing controls: a search box and the intent /
 * enabled / branded filter menu. For `PageShell`'s control band.
 *
 * The bulk-upload, generate, add and done buttons used to sit on this same row.
 * They are not filters — they act on the library rather than narrowing it — so
 * they moved to the identity band with every other route action, and this is
 * what was left. Presentational; state lives in the page.
 */
/** The two filter menus share a vocabulary but not their wording. */
const ENABLED_FILTER_LABEL: Record<'all' | 'enabled' | 'disabled', string> = {
  all: 'All',
  enabled: 'Enabled only',
  disabled: 'Disabled only',
};

const BRANDED_FILTER_LABEL: Record<'all' | 'enabled' | 'disabled', string> = {
  all: 'All',
  enabled: 'Branded only',
  disabled: 'Unbranded only',
};

export function PromptFilterControls({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
}: Readonly<{
  search: string;
  onSearchChange: (value: string) => void;
  filters: PromptFilters;
  onFiltersChange: (filters: PromptFilters) => void;
}>) {
  const activeFilterCount =
    filters.intents.length +
    (filters.enabled === 'all' ? 0 : 1) +
    (filters.branded === 'all' ? 0 : 1);

  // Set lookup: `checked` is computed per intent option in the render loop.
  const selectedIntents = new Set(filters.intents);

  const toggleIntent = (value: string) => {
    const next = selectedIntents.has(value)
      ? filters.intents.filter((intent) => intent !== value)
      : [...filters.intents, value];
    onFiltersChange({ ...filters, intents: next });
  };

  const setEnabled = (value: EnabledFilter) => onFiltersChange({ ...filters, enabled: value });
  const setBranded = (value: EnabledFilter) => onFiltersChange({ ...filters, branded: value });

  return (
    // `contents`: the control band owns the row, its height and its rule.
    <div className="contents">
      <div className="max-w-sm min-w-55 flex-1">
        <SearchField
          size="compact"
          value={search}
          onValueChange={onSearchChange}
          placeholder="Search prompts"
          aria-label="Search prompts"
        />
      </div>

      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="secondary" size="sm">
            <Filter className="size-4" aria-hidden />
            Filter
            {activeFilterCount > 0 ? (
              <span
                className={textRole(
                  'label',
                  'bg-accent-subtle text-accent-text ml-1 rounded-full px-1.5 tabular-nums',
                )}
              >
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </DropdownTrigger>
        <DropdownContent align="end" className="w-56">
          <DropdownLabel>Intent</DropdownLabel>
          {intentValues.map((value) => (
            <DropdownCheckboxItem
              key={value || 'unspecified'}
              checked={selectedIntents.has(value)}
              onSelect={(event) => {
                event.preventDefault();
                toggleIntent(value);
              }}
            >
              {intentLabels[value]}
            </DropdownCheckboxItem>
          ))}
          <DropdownSeparator />
          <DropdownLabel>Enabled</DropdownLabel>
          {(['all', 'enabled', 'disabled'] as const).map((value) => (
            <DropdownCheckboxItem
              key={value}
              checked={filters.enabled === value}
              onSelect={(event) => {
                event.preventDefault();
                setEnabled(value);
              }}
            >
              {ENABLED_FILTER_LABEL[value]}
            </DropdownCheckboxItem>
          ))}
          <DropdownSeparator />
          <DropdownLabel>Branded</DropdownLabel>
          {(['all', 'enabled', 'disabled'] as const).map((value) => (
            <DropdownCheckboxItem
              key={value}
              checked={filters.branded === value}
              onSelect={(event) => {
                event.preventDefault();
                setBranded(value);
              }}
            >
              {BRANDED_FILTER_LABEL[value]}
            </DropdownCheckboxItem>
          ))}
        </DropdownContent>
      </Dropdown>
    </div>
  );
}

/** The library's own actions, for `PageShell`'s identity band. */
export function PromptActions({
  onImport,
  onAdd,
  onGenerate,
  onDoneManaging,
  disabled,
}: Readonly<{
  onImport: () => void;
  onAdd: () => void;
  onGenerate: () => void;
  onDoneManaging?: () => void;
  disabled?: boolean;
}>) {
  return (
    <>
      <Button variant="secondary" size="sm" onClick={onImport} disabled={disabled}>
        <Upload className="size-4" aria-hidden />
        Bulk upload
      </Button>
      <Button variant="secondary" size="sm" onClick={onGenerate} disabled={disabled}>
        <Sparkles className="size-4" aria-hidden />
        Generate prompts
      </Button>
      <Button variant="primary" size="sm" onClick={onAdd} disabled={disabled}>
        Add prompt
      </Button>
      {onDoneManaging ? (
        <Button variant="secondary" size="sm" aria-label="Done managing" onClick={onDoneManaging}>
          <Check className="size-4" aria-hidden />
          Done
        </Button>
      ) : null}
    </>
  );
}
