'use client';

import { CircleHelp } from 'lucide-react';

import { LaunchAuditButton } from '@/components/runs/launch-audit-button';
import { IconButton } from '@/components/ui/button';
import { FilterChoice, FilterTrigger } from '@/components/ui/filter-bar';
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';
import type { LogicalEngine } from '@citeladder/contracts';
import type { ProjectMarket } from '@citeladder/contracts/markets';
import { docsHref } from '@/lib/config/docs';
import { useEngineCatalog } from '@/lib/providers/engines';
import {
  isEvidenceTab,
  type PromptOption,
  type RunOption,
  type VisibilityTab,
} from '@/lib/visibility/dashboard';
import { ANSWER_OUTCOMES } from '@/lib/config/visibility';
import { PROMPT_COHORTS, type PromptCohort } from '@/lib/visibility/prompt-cohort';
import {
  GRANULARITY_OPTIONS,
  RANGE_OPTIONS,
  type TrendGranularity,
  type TrendRange,
} from '@/lib/visibility/trends';

type EngineFilter = LogicalEngine | 'all';
/** The public Visibility guide; the app has no help route of its own. */
const METRICS_HELP_URL = docsHref('/visibility/');

/**
 * Trigger copy for the prompt cohort: whether the questions name a brand.
 * Unbranded questions are the honest headline; branded comparison questions
 * name the brand or a competitor, so they read separately. The menu's own
 * label says "Prompts", so the two cohorts name only their branding: the
 * longer "Unbranded prompts" wrapped the Trends band at the owner's 982px in
 * the wider text face.
 */
const COHORT_LABELS = {
  core: 'Unbranded',
  comparison: 'Branded',
  all: 'All prompts',
} as const satisfies Record<PromptCohort, string>;

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
  cohort: PromptCohort;
  onChangeCohort: (cohort: PromptCohort) => void;
  outcome?: string | null;
  onChangeOutcome?: (outcome: string | null) => void;
  markets?: readonly ProjectMarket[];
  /** A non-default market's id; `null` is the project default. */
  market?: string | null;
  onChangeMarket?: (market: string | null) => void;
}>;

/**
 * Two clusters, and every control answers a question a customer would actually
 * ask: which measurement, over what period, about which prompts and surfaces.
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
  // A period and a grouping only mean something while the page pools every
  // run in a period; beside "Latest run" or one named run they read as a
  // contradiction. They come last, so showing or hiding them never moves a
  // control to their left. Every trigger is as wide as its longest option.
  const pooled = props.selectionMode === 'range';
  return (
    <div className="contents" data-testid="visibility-toolbar">
      <MarketFilter {...props} />
      <MeasurementFilter {...props} />
      <CohortFilter {...props} />
      <EngineFilterControl {...props} />
      {evidence ? <PromptFilter {...props} /> : null}
      {/* The answer-outcome narrowing belongs with the rest of the filters
          rather than in a second row under them. It applies wherever answers
          are rendered, which is Query fanouts. */}
      {evidence && props.onChangeOutcome ? (
        <FilterChoice
          label="Answer outcome"
          value={props.outcome ?? 'all'}
          options={ANSWER_OUTCOMES}
          onChange={(value) => props.onChangeOutcome?.(value === 'all' ? null : value)}
          fit
        />
      ) : null}
      {pooled ? <RangeFilter {...props} /> : null}
      {pooled && props.activeTab === 'trends' ? <GranularityFilter {...props} /> : null}
    </div>
  );
}

/**
 * A single-choice filter whose visible value does not say which filter it is
 * ("Unbranded", "Weekly", a market's name): the trigger prints its label
 * before the value. It stays sized to its longest option, so a choice never
 * moves the controls beside it.
 */
function LabelledChoice<T extends string>({
  label,
  value,
  defaultValue,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  defaultValue: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}>) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterTrigger
          label={label}
          value={options.find((option) => option.value === value)?.label ?? label}
          active={value !== defaultValue}
          sizeTo={options.map((option) => option.label)}
        />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{label}</MenuLabel>
        <MenuRadioGroup value={value}>
          {options.map((option) => (
            <MenuRadioItem
              key={option.value}
              value={option.value}
              onSelect={() => onChange(option.value)}
            >
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

const DEFAULT_MARKET = 'default';

/** Which market the page reads; offered only once a project measures more than one. */
export function MarketFilter({
  markets = [],
  market = null,
  onChangeMarket,
}: Pick<ToolbarProps, 'markets' | 'market' | 'onChangeMarket'>) {
  if (markets.length < 2 || !onChangeMarket) return null;
  return (
    <LabelledChoice
      label="Market"
      value={market ?? DEFAULT_MARKET}
      defaultValue={DEFAULT_MARKET}
      options={markets.map((option) => ({
        value: option.id ?? DEFAULT_MARKET,
        label: option.label,
      }))}
      onChange={(value) => onChangeMarket(value === DEFAULT_MARKET ? null : value)}
    />
  );
}

const COHORT_OPTIONS = PROMPT_COHORTS.map((value) => ({
  value,
  label: COHORT_LABELS[value],
}));

function CohortFilter({ cohort, onChangeCohort }: ToolbarProps) {
  return (
    <LabelledChoice
      label="Prompts"
      value={cohort}
      defaultValue="core"
      options={COHORT_OPTIONS}
      onChange={onChangeCohort}
    />
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
  // A selected run the list no longer carries is not the latest run: saying so
  // keeps a stale link from reading as a fresh measurement.
  const missingRunLabel = selectedRunId ? 'Run unavailable' : 'Latest run';
  const current = pooled ? 'All runs in period' : (selected?.label ?? missingRunLabel);
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterTrigger
          label="Select measurement"
          hideLabel
          value={current}
          active={pooled || Boolean(selectedRunId)}
          sizeTo={[
            'Latest run',
            'All runs in period',
            missingRunLabel,
            ...runs.map((run) => run.label),
          ]}
        />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Measurement</MenuLabel>
        <MenuRadioGroup value={pooled ? '__range__' : (selectedRunId ?? '__latest__')}>
          <MenuRadioItem value="__latest__" onSelect={() => onSelectMeasurement(null)}>
            Latest run
          </MenuRadioItem>
          <MenuRadioItem value="__range__" onSelect={() => onChangeSelectionMode('range')}>
            All runs in period
          </MenuRadioItem>
          {runs.length ? (
            <>
              <MenuSeparator />
              <MenuLabel>Individual runs</MenuLabel>
              {runs.map((run) => (
                <MenuRadioItem
                  key={run.id}
                  value={run.id}
                  onSelect={() => onSelectMeasurement(run.id)}
                >
                  {run.label}
                </MenuRadioItem>
              ))}
            </>
          ) : null}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/**
 * Which measured surface the page is reading.
 *
 * Two groups, not one flat list, and the control no longer says "model". An
 * answer engine is ASKED a question and answers with a model; Google's AI
 * Overview is OBSERVED on a results page and has no model at all. Listing
 * them together under "All models" described three of the four correctly and
 * quietly misdescribed the fourth.
 */
function EngineFilterControl({ engine, onChangeEngine }: ToolbarProps) {
  const catalog = useEngineCatalog();
  const engineLabel = catalog.label;
  const asked = catalog.order.filter((key) => !catalog.isSearchSurface(key));
  const observed = catalog.order.filter((key) => catalog.isSearchSurface(key));
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterTrigger
          label="Filter by surface"
          hideLabel
          value={engine === 'all' ? 'All surfaces' : engineLabel(engine)}
          active={engine !== 'all'}
          sizeTo={['All surfaces', ...catalog.order.map((key) => engineLabel(key))]}
        />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Surface</MenuLabel>
        <MenuRadioGroup value={engine}>
          <MenuRadioItem value="all" onSelect={() => onChangeEngine('all')}>
            All surfaces
          </MenuRadioItem>
          <MenuSeparator />
          <MenuLabel>Answer engines</MenuLabel>
          {asked.map((key) => (
            <MenuRadioItem key={key} value={key} onSelect={() => onChangeEngine(key)}>
              {engineLabel(key)}
            </MenuRadioItem>
          ))}
          {observed.length ? (
            <>
              <MenuSeparator />
              <MenuLabel>Observed surfaces</MenuLabel>
              {observed.map((key) => (
                <MenuRadioItem key={key} value={key} onSelect={() => onChangeEngine(key)}>
                  {engineLabel(key)}
                </MenuRadioItem>
              ))}
            </>
          ) : null}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function RangeFilter({ range, onChangeRange }: ToolbarProps) {
  return (
    <FilterChoice
      label="Select date range"
      menuLabel="Period"
      value={range}
      defaultValue="90d"
      options={RANGE_OPTIONS}
      onChange={onChangeRange}
      fit
    />
  );
}

function GranularityFilter({ granularity, onChangeGranularity }: ToolbarProps) {
  return (
    <LabelledChoice
      label="Group by"
      value={granularity}
      defaultValue="run"
      options={GRANULARITY_OPTIONS}
      onChange={onChangeGranularity}
    />
  );
}

function PromptFilter({ promptOptions, promptId, onChangePrompt }: ToolbarProps) {
  const prompt = promptOptions.find((option) => option.id === promptId);
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterTrigger
          label="Filter by prompt"
          hideLabel
          value={prompt?.label ?? 'Every prompt'}
          active={promptId !== null}
          sizeTo={['Every prompt', ...promptOptions.map((option) => option.label)]}
          className="max-w-64"
        />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Prompt</MenuLabel>
        <MenuRadioGroup value={promptId ?? '__all__'}>
          <MenuRadioItem value="__all__" onSelect={() => onChangePrompt(null)}>
            Every prompt
          </MenuRadioItem>
          {promptOptions.map((option) => (
            <MenuRadioItem
              key={option.id}
              value={option.id}
              onSelect={() => onChangePrompt(option.id)}
            >
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/** Toolbar-adjacent actions, hoisted to the tab row so the filters keep one line. */
export function VisibilityActions() {
  return (
    <>
      <LaunchAuditButton />
      <Tooltip content="How these metrics are calculated">
        <IconButton
          variant="secondary"
          icon={CircleHelp}
          label="About these metrics"
          tooltip={false}
          href={METRICS_HELP_URL}
        />
      </Tooltip>
    </>
  );
}
