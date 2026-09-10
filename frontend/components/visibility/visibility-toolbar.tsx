'use client';

import { CalendarRange, ChevronDown, CircleHelp, Download } from 'lucide-react';
import { forwardRef } from 'react';

import { LaunchAuditButton } from '@/components/runs/launch-audit-button';
import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownContent,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Tooltip } from '@/components/ui/tooltip';
import type { LogicalEngine } from '@/lib/api/types';
import { ICONS } from '@/lib/icons';
import {
  engineLabel,
  isEvidenceTab,
  type PromptOption,
  type RunOption,
  type VisibilityTab,
} from '@/lib/visibility/dashboard';
import { ANSWER_OUTCOMES, SOURCE_MODES } from '@/lib/config/visibility';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import {
  GRANULARITY_OPTIONS,
  RANGE_OPTIONS,
  TREND_ENGINES,
  granularityLabel,
  rangeLabel,
  type TrendGranularity,
  type TrendRange,
} from '@/lib/visibility/trends';
import { textRole } from '@/components/ui/typography';

type EngineFilter = LogicalEngine | 'all';
const METRICS_HELP_URL = '/faq';

/**
 * Trigger copy for the prompt cohort.
 *
 * The trigger used to read "Core" — a word from the metrics schema that told a
 * reader nothing about what they were looking at. Both cohorts now name the
 * kind of question that was asked.
 */
const COHORT_LABELS = {
  core: 'Visibility prompts',
  comparison: 'Comparison prompts',
} as const;

type ToolbarProps = Readonly<{
  activeTab: VisibilityTab;
  selectionMode?: 'run' | 'range';
  onChangeSelectionMode: (mode: 'run' | 'range') => void;
  runs: RunOption[];
  selectedRunId: string | null;
  /** Selects a run AND leaves range mode in one URL write. */
  onSelectMeasurement: (runId: string | null) => void;
  engine: EngineFilter;
  onChangeEngine: (engine: EngineFilter) => void;
  promptOptions: PromptOption[];
  promptId: string | null;
  onChangePrompt: (promptId: string | null) => void;
  range: TrendRange;
  onChangeRange: (range: TrendRange) => void;
  granularity: TrendGranularity;
  onChangeGranularity: (granularity: TrendGranularity) => void;
  cohort: 'core' | 'comparison';
  onChangeCohort: (cohort: 'core' | 'comparison') => void;
  sourceMode?: 'sources' | 'answers';
  onChangeSourceMode?: (mode: 'sources' | 'answers') => void;
  outcome?: string | null;
  onChangeOutcome?: (outcome: string | null) => void;
}>;

/**
 * Two clusters, and every control answers a question a customer would actually
 * ask: which measurement, over what period, about which prompts and models.
 *
 * What used to sit here and no longer does: a separate "Measurement selection"
 * toggle (folded into the measurement picker, because "which run am I looking
 * at" is one question, not two), a "Comparison baseline" picker and a "Frozen
 * configuration" picker (both are analyst controls that named internal
 * machinery; they stay honoured from the URL and are no longer surfaced as
 * permanent chrome).
 */
export function VisibilityToolbar(props: ToolbarProps) {
  const evidence = isEvidenceTab(props.activeTab);
  return (
    <div className="contents" data-testid="visibility-toolbar">
      <MeasurementFilter {...props} />
      <RangeFilter {...props} />
      {props.activeTab === 'trends' ? <GranularityFilter {...props} /> : null}
      <span className="bg-border mx-1 hidden h-5 w-px sm:block" aria-hidden />
      <CohortFilter {...props} />
      <EngineFilterControl {...props} />
      {evidence ? <PromptFilter {...props} /> : null}
      {/* Mentions & Citations used to stack its own filter row under this one.
          Two rows of filters is one row too many; these belong with the rest. */}
      {props.activeTab === 'mentions-citations' && props.onChangeSourceMode ? (
        <AnalysisChoice
          label="Show"
          value={props.sourceMode ?? 'sources'}
          options={SOURCE_MODES}
          onChange={props.onChangeSourceMode}
        />
      ) : null}
      {props.activeTab === 'mentions-citations' &&
      props.sourceMode === 'answers' &&
      props.onChangeOutcome ? (
        <AnalysisChoice
          label="Answer outcome"
          value={props.outcome ?? 'all'}
          options={ANSWER_OUTCOMES}
          onChange={(value) => props.onChangeOutcome?.(value === 'all' ? null : value)}
        />
      ) : null}
    </div>
  );
}

const FilterButton = forwardRef<
  HTMLButtonElement,
  Readonly<
    Omit<React.ComponentPropsWithoutRef<typeof Button>, 'aria-label' | 'children'> & {
      active: boolean;
      label: string;
      children: React.ReactNode;
    }
  >
>(function FilterButton({ active, label, children, className, ...buttonProps }, ref) {
  return (
    <Button
      ref={ref}
      variant={active ? 'tonal' : 'secondary'}
      size="sm"
      aria-label={label}
      className={className}
      {...buttonProps}
    >
      {children}
      <ChevronDown className="text-muted size-3" aria-hidden />
    </Button>
  );
});

function CohortFilter({ cohort, onChangeCohort }: ToolbarProps) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <FilterButton active={cohort !== 'core'} label="Filter by prompt type">
          <ICONS.prompts className="text-muted size-3" aria-hidden />
          <span>{COHORT_LABELS[cohort]}</span>
        </FilterButton>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Prompt type</DropdownLabel>
        <DropdownRadioGroup value={cohort}>
          <DropdownRadioItem value="core" onSelect={() => onChangeCohort('core')}>
            {COHORT_LABELS.core}
          </DropdownRadioItem>
          <DropdownRadioItem value="comparison" onSelect={() => onChangeCohort('comparison')}>
            {COHORT_LABELS.comparison}
          </DropdownRadioItem>
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}

/**
 * Which measurement the page is reading — one run, or every run in the period.
 *
 * These were two adjacent chips ("Selected run" beside "Latest run"), which
 * asked the reader to hold a mode and a value apart before either meant
 * anything. One menu, one answer.
 */
function MeasurementFilter({
  runs,
  selectedRunId,
  onSelectMeasurement,
  selectionMode,
  onChangeSelectionMode,
}: ToolbarProps) {
  const pooled = selectionMode === 'range';
  const selected = runs.find((run) => run.id === selectedRunId);
  const current = pooled
    ? 'All runs in period'
    : (selected?.label ?? (selectedRunId ? 'Run unavailable' : 'Latest run'));
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <FilterButton active={pooled || Boolean(selectedRunId)} label="Select measurement">
          <ICONS.runs className="text-muted size-3" aria-hidden />
          <span>{current}</span>
        </FilterButton>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Measurement</DropdownLabel>
        <DropdownRadioGroup value={pooled ? '__range__' : (selectedRunId ?? '__latest__')}>
          <DropdownRadioItem value="__latest__" onSelect={() => onSelectMeasurement(null)}>
            Latest run
          </DropdownRadioItem>
          <DropdownRadioItem value="__range__" onSelect={() => onChangeSelectionMode('range')}>
            All runs in period
          </DropdownRadioItem>
          {runs.length ? (
            <>
              <DropdownSeparator />
              <DropdownLabel>Individual runs</DropdownLabel>
              {runs.map((run) => (
                <DropdownRadioItem
                  key={run.id}
                  value={run.id}
                  onSelect={() => onSelectMeasurement(run.id)}
                >
                  {run.label}
                </DropdownRadioItem>
              ))}
            </>
          ) : null}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}

function EngineFilterControl({ engine, onChangeEngine }: ToolbarProps) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <FilterButton active={engine !== 'all'} label="Filter by model">
          <ICONS.analytics className="size-3" aria-hidden />
          <span>{engine === 'all' ? 'All models' : engineLabel(engine)}</span>
        </FilterButton>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Model</DropdownLabel>
        <DropdownRadioGroup value={engine}>
          <DropdownRadioItem value="all" onSelect={() => onChangeEngine('all')}>
            All models
          </DropdownRadioItem>
          {TREND_ENGINES.map((engine) => (
            <DropdownRadioItem key={engine} value={engine} onSelect={() => onChangeEngine(engine)}>
              {engineLabel(engine)}
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}

function RangeFilter({ range, onChangeRange }: ToolbarProps) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <FilterButton active={range !== '90d'} label="Select date range">
          <CalendarRange className="size-3" aria-hidden />
          <span>{rangeLabel(range)}</span>
        </FilterButton>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Period</DropdownLabel>
        <DropdownRadioGroup value={range}>
          {RANGE_OPTIONS.map((option) => (
            <DropdownRadioItem
              key={option.value}
              value={option.value}
              onSelect={() => onChangeRange(option.value)}
            >
              {option.label}
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}

function GranularityFilter({ granularity, onChangeGranularity }: ToolbarProps) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <FilterButton active={granularity !== 'run'} label="Select granularity">
          <span>{granularityLabel(granularity)}</span>
        </FilterButton>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Group history by</DropdownLabel>
        <DropdownRadioGroup value={granularity}>
          {GRANULARITY_OPTIONS.map((option) => (
            <DropdownRadioItem
              key={option.value}
              value={option.value}
              onSelect={() => onChangeGranularity(option.value)}
            >
              {option.label}
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}

function PromptFilter({ promptOptions, promptId, onChangePrompt }: ToolbarProps) {
  const prompt = promptOptions.find((option) => option.id === promptId);
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <FilterButton active={promptId !== null} label="Filter by prompt">
          <ICONS.prompts className="size-3" aria-hidden />
          <span className={textRole('emphasis', 'max-w-[16ch] truncate')}>
            {prompt?.label ?? 'Every prompt'}
          </span>
        </FilterButton>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Prompt</DropdownLabel>
        <DropdownRadioGroup value={promptId ?? '__all__'}>
          <DropdownRadioItem value="__all__" onSelect={() => onChangePrompt(null)}>
            Every prompt
          </DropdownRadioItem>
          {promptOptions.map((option) => (
            <DropdownRadioItem
              key={option.id}
              value={option.id}
              onSelect={() => onChangePrompt(option.id)}
            >
              {option.label}
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}

/** Toolbar-adjacent actions, hoisted to the tab row so the filters keep one line. */
export function VisibilityActions() {
  return (
    <>
      <LaunchAuditButton size="sm" />
      <Tooltip content="How these metrics are calculated">
        <Button variant="secondary" size="icon" asChild>
          <a href={METRICS_HELP_URL} aria-label="About these metrics">
            <CircleHelp className="size-3" aria-hidden />
          </a>
        </Button>
      </Tooltip>
      <Tooltip content="Export is available from a run (coming with reports)">
        <span>
          <Button variant="secondary" size="sm" disabled aria-disabled="true">
            <Download className="size-3" aria-hidden />
            Export
          </Button>
        </span>
      </Tooltip>
    </>
  );
}
