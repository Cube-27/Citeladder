import { ChevronDown, Pencil, Sparkles, Upload } from 'lucide-react';

import { LaunchAuditButton } from '@/components/runs/launch-audit-button';
import { ACTIONS } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { choiceFilter, manyFilter, type FilterDefinition } from '@/components/ui/all-filters';
import type { FilterBarProps } from '@/components/ui/filter-bar';
import { Icon } from '@/components/ui/icon';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedControl } from '@/components/ui/tabs';
import type { PromptStatus } from '@citeladder/contracts';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import {
  buyerStageLabels,
  buyerStageValues,
  intentLabels,
  intentValues,
} from '@/lib/prompts/forms';
import type { EnabledFilter, PromptFilters } from '@/lib/prompts/filter';

const PROMPT_STATUSES: readonly { value: PromptStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

/**
 * The prompt library's control row: the Active / Archived view, the
 * search, then every filter in All filters: Topic first, then Intent, Buyer
 * stage, Persona (when the library has any), Brands and Sources (once a run
 * has measured the prompts), Enabled and Branded.
 * Presentational; state lives in the page.
 */
/** The two single choices share a vocabulary but not their wording. */
const ENABLED_FILTER_LABEL: Record<EnabledFilter, string> = {
  all: 'All',
  enabled: 'Enabled only',
  disabled: 'Disabled only',
};

const BRANDED_FILTER_LABEL: Record<EnabledFilter, string> = {
  all: 'All',
  enabled: 'Branded only',
  disabled: 'Unbranded only',
};

const SINGLE_CHOICES = ['all', 'enabled', 'disabled'] as const;

function singleChoice(
  id: string,
  label: string,
  labels: Record<EnabledFilter, string>,
  value: EnabledFilter,
  onChange: (value: EnabledFilter) => void,
): FilterDefinition {
  return choiceFilter({
    id,
    label,
    value,
    defaultValue: 'all',
    defaultIsEvery: true,
    groups: [
      { options: SINGLE_CHOICES.map((choice) => ({ value: choice, label: labels[choice] })) },
    ],
    onChange,
  });
}

type FilterChoice = Readonly<{ value: string; label: string }>;
type MeasuredChoices = Readonly<{
  brands: readonly FilterChoice[];
  sources: readonly FilterChoice[];
}>;

/** Brands and Sources: what the prompts' latest answers named and cited. */
function measuredFilters({
  choices: { brands, sources },
  filters,
  onFiltersChange,
}: Readonly<{
  choices: MeasuredChoices;
  filters: PromptFilters;
  onFiltersChange: (filters: PromptFilters) => void;
}>): FilterDefinition[] {
  return [
    manyFilter({
      id: 'brands',
      label: 'Brands',
      allLabel: 'All brands',
      values: filters.brands,
      options: brands,
      onChange: (next) => onFiltersChange({ ...filters, brands: next }),
    }),
    ...(sources.length
      ? [
          manyFilter({
            id: 'sources',
            label: 'Sources',
            allLabel: 'All sources',
            values: filters.sources,
            options: sources,
            onChange: (next) => onFiltersChange({ ...filters, sources: next }),
          }),
        ]
      : []),
  ];
}

export function promptFilterControls({
  status,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  personas = [],
  measured,
  topic,
}: Readonly<{
  /** Active / Archived, with the number of prompts in each. */
  status: Readonly<{
    value: PromptStatus;
    counts: Readonly<Record<PromptStatus, number>>;
    onChange: (value: PromptStatus) => void;
  }>;
  search: string;
  onSearchChange: (value: string) => void;
  filters: PromptFilters;
  onFiltersChange: (filters: PromptFilters) => void;
  /** The personas the library uses; the menu lists them when there are any. */
  personas?: readonly string[];
  /** The Brands and Sources choices, once a run has measured the prompts. */
  measured?: MeasuredChoices;
  /** The Topic filter (`topicFilter`), first in All filters. */
  topic?: FilterDefinition;
}>): FilterBarProps {
  return {
    view: (
      <SegmentedControl
        ariaLabel="Prompt status"
        value={status.value}
        onChange={status.onChange}
        options={PROMPT_STATUSES.map((option) => ({
          value: option.value,
          label: option.label,
          count: status.counts[option.value],
        }))}
      />
    ),
    search: (
      <SearchField
        value={search}
        onValueChange={onSearchChange}
        placeholder="Search prompts"
        aria-label="Search prompts"
      />
    ),
    filters: [
      ...(topic ? [topic] : []),
      manyFilter({
        id: 'intent',
        label: 'Intent',
        allLabel: 'All intents',
        values: filters.intents,
        options: intentValues.map((value) => ({ value, label: intentLabels[value] })),
        onChange: (intents) => onFiltersChange({ ...filters, intents }),
      }),
      manyFilter({
        id: 'stage',
        label: 'Buyer stage',
        allLabel: 'All stages',
        values: filters.stages,
        options: buyerStageValues.map((value) => ({ value, label: buyerStageLabels[value] })),
        onChange: (stages) => onFiltersChange({ ...filters, stages }),
      }),
      ...(personas.length
        ? [
            manyFilter({
              id: 'persona',
              label: 'Persona',
              allLabel: 'All personas',
              values: filters.personas,
              options: personas.map((value) => ({ value, label: value })),
              onChange: (next) => onFiltersChange({ ...filters, personas: next }),
            }),
          ]
        : []),
      ...(measured ? measuredFilters({ choices: measured, filters, onFiltersChange }) : []),
      singleChoice('enabled', 'Enabled', ENABLED_FILTER_LABEL, filters.enabled, (enabled) =>
        onFiltersChange({ ...filters, enabled }),
      ),
      singleChoice('branded', 'Branded', BRANDED_FILTER_LABEL, filters.branded, (branded) =>
        onFiltersChange({ ...filters, branded }),
      ),
    ],
  };
}

/** The three ways to add prompts, one named action wherever it appears. */
export type AddPromptsHandlers = Readonly<{
  onImport: () => void;
  onAdd: () => void;
  onGenerate: () => void;
}>;

/**
 * The library's own actions, for the masthead: "Add prompts" and Launch run.
 * An empty library carries "Add prompts" in its empty state instead
 * (`inEmptyState`), so the action never shows twice in one view.
 */
export function PromptActions({
  add,
  inEmptyState = false,
}: Readonly<{ add: AddPromptsHandlers; inEmptyState?: boolean }>) {
  // Each control is offered only to a role that may use it.
  const canWrite = useWorkspaceCapability('write');
  return (
    <>
      {canWrite && !inEmptyState ? <AddPromptsMenu {...add} /> : null}
      <MastheadPrimary>
        <LaunchAuditButton />
      </MastheadPrimary>
    </>
  );
}

/** "Add prompts": defined once (label, icon, look) for the masthead and the empty state. */
export function AddPromptsMenu({ onImport, onAdd, onGenerate }: AddPromptsHandlers) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant={ACTIONS.addPrompts.variant}>
          <Icon icon={ACTIONS.addPrompts.icon} />
          {ACTIONS.addPrompts.label}
          <Icon icon={ChevronDown} className="opacity-80" />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem icon={<Icon icon={Pencil} />} onSelect={onAdd}>
          Write a prompt
        </MenuItem>
        <MenuItem icon={<Icon icon={Sparkles} />} onSelect={onGenerate}>
          Prompt builder
        </MenuItem>
        <MenuItem icon={<Icon icon={Upload} />} onSelect={onImport}>
          Bulk upload
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
