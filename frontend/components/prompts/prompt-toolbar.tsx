'use client';

import { Bot, ChevronDown, Filter, Plus, Sparkles, Upload } from 'lucide-react';

import { LaunchAuditButton } from '@/components/runs/launch-audit-button';
import { ProjectLink } from '@/components/layout/scoped-link';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { FilterRow, FilterTrigger } from '@/components/ui/filter-row';
import { SearchField } from '@/components/ui/search-field';
import { intentLabels, intentValues } from '@/lib/prompts/forms';
import type { EnabledFilter, PromptFilters } from '@/lib/prompts/filter';

/**
 * The prompt library's narrowing controls: a search box and the intent /
 * enabled / branded filter menu. For `PageShell`'s control band.
 *
 * The bulk-upload, generate and add buttons used to sit on this same row.
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
    <FilterRow
      searchWidth="lg"
      search={
        <SearchField
          size="compact"
          value={search}
          onValueChange={onSearchChange}
          placeholder="Search prompts"
          aria-label="Search prompts"
        />
      }
    >
      <Dropdown>
        <DropdownTrigger asChild>
          <FilterTrigger label="Filter" icon={Filter} count={activeFilterCount} />
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
    </FilterRow>
  );
}

/**
 * The library's own actions, for `PageShell`'s identity band: the four ways to
 * add prompts share one menu, so the band holds one secondary and one primary
 * action at every width instead of wrapping five buttons over the title.
 */
export function PromptActions({
  onImport,
  onAdd,
  onGenerate,
  hasActivePrompts,
}: Readonly<{
  onImport: () => void;
  onAdd: () => void;
  onGenerate: () => void;
  /** Launch audit measures active prompts, so it waits for at least one. */
  hasActivePrompts: boolean;
}>) {
  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="secondary" size="sm">
            <Plus className="size-4" aria-hidden />
            Add prompts
            <ChevronDown className="size-3.5 opacity-80" aria-hidden />
          </Button>
        </DropdownTrigger>
        <DropdownContent align="end" className="w-56">
          <DropdownItem onSelect={onAdd}>
            <Plus className="size-4" aria-hidden />
            Add prompt
          </DropdownItem>
          <DropdownItem onSelect={onGenerate}>
            <Sparkles className="size-4" aria-hidden />
            Generate prompts
          </DropdownItem>
          <DropdownItem onSelect={onImport}>
            <Upload className="size-4" aria-hidden />
            Bulk upload
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem asChild>
            <ProjectLink
              href={agentHandoffHref({
                skillId: 'prompt_discovery',
                prompt:
                  'Build a portfolio of distinct buyer questions for this project. Keep the existing topics. Read the current prompt portfolio and business evidence, identify meaningful buying decisions and gaps, and prepare new unbranded questions for prompt review.',
              })}
            >
              <Bot className="size-4" aria-hidden />
              Build with Agent
            </ProjectLink>
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <LaunchAuditButton variant="primary" size="sm" disabled={!hasActivePrompts} />
    </>
  );
}
