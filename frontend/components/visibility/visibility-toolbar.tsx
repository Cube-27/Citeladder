import { CircleHelp } from 'lucide-react';

import { LaunchAuditButton } from '@/components/runs/launch-audit-button';
import { choiceFilter, rangeFilter, type FilterDefinition } from '@/components/ui/all-filters';
import { IconButton } from '@/components/ui/button';
import { engineOptionMark } from '@/components/ui/engine-mark';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { Tooltip } from '@/components/ui/tooltip';
import type { LogicalEngine } from '@citeladder/contracts';
import type { ProjectMarket } from '@citeladder/contracts/markets';
import { docsHref } from '@/lib/config/docs';
import { useEngineCatalog } from '@/lib/providers/engines';
import {
  isEvidenceTab,
  type PromptOption,
  type RunOption,
  type VisibilityView,
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
 * The prompt cohort: whether the questions name a brand. Unbranded questions
 * are the honest headline; branded comparison questions name the brand or a
 * competitor, so they read separately. The filter is called "Prompts", so the
 * two cohorts name only their branding.
 */
const COHORT_LABELS = {
  core: 'Unbranded',
  comparison: 'Branded',
  all: 'All prompts',
} as const satisfies Record<PromptCohort, string>;

type ToolbarProps = Readonly<{
  view: VisibilityView;
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
  /** The project's topics; a page that reads by frozen topic passes them. */
  topics?: readonly { id: string; name: string }[];
  topic?: string | null;
  onChangeTopic?: (topic: string | null) => void;
}>;

/**
 * The filters every AI visibility view shares, for its control row. Every
 * one answers a question a customer would ask: which market, which
 * measurement, about which prompts and surfaces, over what period.
 *
 * A period and a grouping only mean something while the page pools every run
 * in a period; beside "Latest run" or one named run they read as a
 * contradiction, so they are listed only then. The prompt and
 * answer-outcome filters apply where answers are rendered (Query fanouts).
 *
 * The analyst controls that named internal machinery (a comparison baseline,
 * a frozen configuration) stay honoured from the URL and are not offered.
 */
export function useVisibilityFilterMenu(props: ToolbarProps): FilterDefinition[] {
  const catalog = useEngineCatalog();
  const evidence = isEvidenceTab(props.view);
  const pooled = props.selectionMode === 'range';
  const filters: Record<FilterId, FilterDefinition | null> = {
    market: marketFilter(props),
    measurement: measurementFilter(props),
    range: pooled
      ? rangeFilter({
          value: props.range,
          defaultValue: '90d',
          options: RANGE_OPTIONS,
          onChange: props.onChangeRange,
        })
      : null,
    cohort: choiceFilter({
      id: 'cohort',
      label: 'Prompts',
      icon: 'prompts',
      value: props.cohort,
      defaultValue: 'core',
      groups: [
        { options: PROMPT_COHORTS.map((value) => ({ value, label: COHORT_LABELS[value] })) },
      ],
      onChange: props.onChangeCohort,
    }),
    engine: engineFilter(props, catalog),
    topic: topicFilter(props),
    prompt: evidence ? promptFilter(props) : null,
    outcome: evidence ? outcomeFilter(props) : null,
    granularity:
      pooled && (props.view === 'insights' || props.view === 'competitor')
        ? choiceFilter({
            id: 'granularity',
            label: 'Group by',
            value: props.granularity,
            defaultValue: 'run',
            groups: [{ options: GRANULARITY_OPTIONS }],
            onChange: props.onChangeGranularity,
          })
        : null,
  };
  return filterOrder(props.view)
    .map((id) => filters[id])
    .filter((filter): filter is FilterDefinition => filter !== null);
}

type FilterId =
  | 'market'
  | 'measurement'
  | 'range'
  | 'cohort'
  | 'engine'
  | 'topic'
  | 'prompt'
  | 'outcome'
  | 'granularity';

/**
 * Each page's order, so the row's four icon chips are the ones it reads by
 * most (the filter placement approved 2026-11-18): the window first, its
 * period beside it while runs are pooled, then the page's own three.
 */
function filterOrder(view: VisibilityView): readonly FilterId[] {
  const tail = ['prompt', 'outcome', 'granularity'] as const;
  if (view === 'insights')
    return ['measurement', 'range', 'engine', 'market', 'cohort', 'topic', ...tail];
  if (view === 'competitors' || view === 'competitor' || view === 'perception')
    return ['measurement', 'range', 'engine', 'market', 'topic', 'cohort', ...tail];
  return ['measurement', 'range', 'engine', 'cohort', 'topic', 'market', ...tail];
}

const DEFAULT_MARKET = 'default';

/** Which market the page reads; offered only once a project measures more than one. */
export function marketFilter({
  markets = [],
  market = null,
  onChangeMarket,
}: Pick<ToolbarProps, 'markets' | 'market' | 'onChangeMarket'>): FilterDefinition | null {
  if (markets.length < 2 || !onChangeMarket) return null;
  return choiceFilter({
    id: 'market',
    label: 'Market',
    icon: 'market',
    value: market ?? DEFAULT_MARKET,
    defaultValue: DEFAULT_MARKET,
    groups: [
      {
        options: markets.map((option) => ({
          value: option.id ?? DEFAULT_MARKET,
          label: option.label,
        })),
      },
    ],
    onChange: (value) => onChangeMarket(value === DEFAULT_MARKET ? null : value),
  });
}

const LATEST = '__latest__';
const POOLED = '__range__';

/**
 * Which measurement the page is reading: one run, or every run in the period.
 * One filter, because "which run am I looking at" is one question, not a mode
 * and a value held apart.
 */
function measurementFilter({
  runs,
  selectedRunId,
  onSelectMeasurement,
  selectionMode,
  onChangeSelectionMode,
}: ToolbarProps): FilterDefinition {
  const pooled = selectionMode === 'range';
  const selected = runs.find((run) => run.id === selectedRunId);
  // A selected run the list no longer carries is not the latest run: saying so
  // keeps a stale link from reading as a fresh measurement.
  const missingRunLabel = selectedRunId ? 'Run unavailable' : 'Latest run';
  const [latest] = runs;
  return choiceFilter({
    id: 'measurement',
    label: 'Measurement',
    icon: 'period',
    // The run read, named at the row's end while the chip shows only its icon.
    windowLabel: latest ? `Latest run · ${latest.label}` : undefined,
    value: pooled ? POOLED : (selectedRunId ?? LATEST),
    defaultValue: LATEST,
    valueLabel: pooled ? 'All runs in period' : (selected?.label ?? missingRunLabel),
    groups: [
      {
        options: [
          { value: LATEST, label: 'Latest run' },
          { value: POOLED, label: 'All runs in period' },
        ],
      },
      ...(runs.length
        ? [
            {
              label: 'Individual runs',
              options: runs.map((run) => ({ value: run.id, label: run.label })),
            },
          ]
        : []),
    ],
    onChange: (value) => {
      if (value === POOLED) onChangeSelectionMode('range');
      else onSelectMeasurement(value === LATEST ? null : value);
    },
  });
}

/**
 * Which measured surface the page is reading, in two groups. An answer engine
 * is ASKED a question and answers with a model; Google's AI Overview is
 * OBSERVED on a results page and has no model, so the filter says "surface".
 */
function engineFilter(
  { engine, onChangeEngine }: ToolbarProps,
  catalog: ReturnType<typeof useEngineCatalog>,
): FilterDefinition {
  const option = (key: LogicalEngine) => ({
    value: key,
    label: catalog.label(key),
    mark: engineOptionMark(key),
  });
  const asked = catalog.order.filter((key) => !catalog.isSearchSurface(key));
  const observed = catalog.order.filter((key) => catalog.isSearchSurface(key));
  return choiceFilter<EngineFilter>({
    id: 'engine',
    label: 'Surface',
    icon: 'engines',
    value: engine,
    defaultValue: 'all',
    valueLabel: engine === 'all' ? 'All surfaces' : catalog.label(engine),
    groups: [
      { options: [{ value: 'all', label: 'All surfaces' }] },
      { label: 'Answer engines', options: asked.map(option) },
      ...(observed.length ? [{ label: 'Observed surfaces', options: observed.map(option) }] : []),
    ],
    onChange: onChangeEngine,
  });
}

const EVERY_TOPIC = '__all__';

/**
 * Which project topic the answers were filed under when their run froze them
 * (AV-5), so a prompt refiled later keeps its old answers where they were.
 */
function topicFilter({
  topics = [],
  topic = null,
  onChangeTopic,
}: ToolbarProps): FilterDefinition | null {
  if (!onChangeTopic || (topics.length === 0 && topic === null)) return null;
  return choiceFilter({
    id: 'topic',
    label: 'Topic',
    icon: 'topic',
    value: topic ?? EVERY_TOPIC,
    defaultValue: EVERY_TOPIC,
    valueLabel:
      topic === null
        ? 'All topics'
        : (topics.find((option) => option.id === topic)?.name ?? 'Deleted topic'),
    groups: [
      {
        options: [
          { value: EVERY_TOPIC, label: 'All topics' },
          ...topics.map((option) => ({ value: option.id, label: option.name })),
        ],
      },
    ],
    onChange: (value) => onChangeTopic(value === EVERY_TOPIC ? null : value),
  });
}

const EVERY_PROMPT = '__all__';

/** One tracked prompt; the list is long, so its submenu searches. */
function promptFilter({ promptOptions, promptId, onChangePrompt }: ToolbarProps): FilterDefinition {
  return choiceFilter({
    id: 'prompt',
    label: 'Prompt',
    value: promptId ?? EVERY_PROMPT,
    defaultValue: EVERY_PROMPT,
    groups: [
      {
        options: [
          { value: EVERY_PROMPT, label: 'Every prompt' },
          ...promptOptions.map((option) => ({ value: option.id, label: option.label })),
        ],
      },
    ],
    onChange: (value) => onChangePrompt(value === EVERY_PROMPT ? null : value),
  });
}

function outcomeFilter({ outcome, onChangeOutcome }: ToolbarProps): FilterDefinition | null {
  if (!onChangeOutcome) return null;
  return choiceFilter({
    id: 'outcome',
    label: 'Answer outcome',
    value: outcome ?? 'all',
    defaultValue: 'all',
    groups: [{ options: ANSWER_OUTCOMES }],
    onChange: (value) => onChangeOutcome(value === 'all' ? null : value),
  });
}

/**
 * Header actions beside the page title: run a new audit, and how the metrics
 * work. `launch: false` when the empty state carries Launch run itself.
 */
export function VisibilityActions({ launch = true }: Readonly<{ launch?: boolean }>) {
  return (
    <>
      {launch ? (
        <MastheadPrimary>
          <LaunchAuditButton />
        </MastheadPrimary>
      ) : null}
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
