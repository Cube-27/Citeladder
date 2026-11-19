import { Archive, Check, MoreHorizontal, Pencil, Power, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { PromptAnswerRef } from '@/components/prompts/prompt-evidence';
import { TextLink } from '@/components/ui/text-link';
import { IconButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Delta } from '@/components/ui/delta';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import {
  isRowSurfaceClick,
  TableActionsCell,
  TableCell,
  TableCellLines,
  TableRow,
  TableSelectCell,
} from '@/components/ui/table';
import { pageNumberControls, useTablePage } from '@/components/ui/pager';
import { Absence } from '@/components/ui/absence';
import { ClampText } from '@/components/ui/clamp-text';
import { NamedBrandMarks } from '@/components/visibility/named-brand-marks';
import { SentimentValue } from '@/components/visibility/sentiment-value';
import type { NamedBrand, NetSentiment, Prompt, PromptStatus } from '@citeladder/contracts';
import { SHARE_OF_VOICE_HINT } from '@/lib/config/visibility';
import { ICONS } from '@/lib/icons';
import { useProjectHref } from '@/lib/navigation/project-destination';
import type { PromptMentions } from '@/lib/prompts/filter';
import { promptHistoryHref } from '@/lib/prompts/history';
import type { RowSelectionState } from '@/lib/prompts/selection';

import { CitedDomainMarks } from './cited-domain-marks';
import { NO_ANSWERS, NOT_MEASURED, positionAbsence } from './prompt-figures';
import { formatPositionExact, formatRate, measured } from '@/lib/visibility/dashboard';

/**
 * The change since the run that measured the same prompt before (owner,
 * 2026-11-15): a delta in points, its first measurement, or a pair that could
 * not be compared (different settings, or no answers on one side).
 */
export type PromptChange =
  | { kind: 'delta'; points: number }
  | { kind: 'first' }
  | { kind: 'not_compared'; reason: 'changed_context' | 'no_observations' };

/** What the run that last measured a prompt found, keyed by prompt id. */
export type PromptMeasurement = PromptMentions & {
  visibilityRate: number | null;
  /** Answers citing an owned page, over the prompt's successful answers. */
  ownedCitationRate: number | null;
  change: PromptChange;
  position: number | null;
  shareOfVoice: number | null;
  /** Null when the run classified no sentiment (admitted without perception). */
  sentiment: NetSentiment | null;
  /** Distinct brands named in the answers; `brands` is the leading few. */
  mentions: number;
  brands: readonly NamedBrand[];
  /** Where that run asked the prompt: the row opens that answer. */
  answer: PromptAnswerRef;
};

/** What a prompt row's controls do. */
export type PromptRowActions = Readonly<{
  onEdit: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
  onToggleEnabled: (prompt: Prompt) => void;
  onSetStatus: (prompt: Prompt, status: PromptStatus) => void;
}>;

/** Rows per page on the prompt table (client-side; the list arrives whole). */
const PAGE_SIZE = 10;

function emptyState(rows: number, onClearFilters?: () => void): DataTableState | undefined {
  if (rows > 0) return undefined;
  const heading = 'No prompts match your search or filters';
  return onClearFilters
    ? { kind: 'filtered', headingLevel: 3, heading, onClear: onClearFilters }
    : { kind: 'empty', icon: ICONS.prompts, headingLevel: 3, heading };
}

/**
 * Prompt table (F7). Questions, their topic and measured visibility, with a
 * per-row menu (edit, enable or disable, archive or restore, delete). A click anywhere on a row outside its
 * controls opens the latest run's answer to the prompt, or the prompt's
 * history when no run has measured it.
 *
 * The measured columns arrive as a map rather than being fetched here: the
 * prompt IS the object a reader is looking at, so its result belongs on this
 * row. It previously lived in a "Prompt analysis" card on the Visibility
 * dashboard, where the prompt was a detail of a measurement instead.
 * Client-side pagination footer
 * (tabular page indicator + ghost buttons) per the prompts frame. Purely
 * presentational — CRUD is delegated to callbacks owned by the page.
 */
export function PromptTable({
  prompts,
  actions,
  measurements,
  setNames,
  topicNames,
  commerceSetIds,
  selection,
  onClearFilters,
  onOpenAnswer,
  resetKey,
}: Readonly<{
  prompts: Prompt[];
  /** The search, topic and filters: a change opens the first page. */
  resetKey?: string;
  /** Set while search, topic or filters hide rows the tab has: an empty table offers to clear them. */
  onClearFilters?: () => void;
  /** Opens the answer the latest run got for a measured prompt. */
  onOpenAnswer?: (prompt: Prompt, answer: PromptAnswerRef) => void;
  /** Each topic's name by id; omitted until the topic list is read. */
  topicNames?: ReadonlyMap<string, string>;
  /** Row checkboxes for bulk actions, for a role that may edit prompts. */
  selection?: RowSelectionState;
  /** Sets whose prompts Commerce measures as a shelf: they have no per-prompt figures. */
  commerceSetIds?: ReadonlySet<string>;
  /** Each prompt set's name by id: the library lists every set's prompts. */
  setNames?: ReadonlyMap<string, string>;
  /** The row menu, for a role that may edit prompts. */
  actions?: PromptRowActions;
  /** Latest-run measurement per prompt id. Omitted before any run exists. */
  measurements?: ReadonlyMap<string, PromptMeasurement>;
}>) {
  // With no run there is nothing measured for ANY prompt, so the columns are
  // not drawn at all rather than filling with placeholders.
  const hasRun = Boolean(measurements?.size);
  // After a first run every change is "first measurement": the column would
  // be a column of the same mark, so it waits for a run that can compare.
  const compared = [...(measurements?.values() ?? [])].some(
    (measurement) => measurement.change.kind !== 'first',
  );
  const shelf = prompts.some((prompt) => commerceSetIds?.has(prompt.prompt_set_id));
  const measuredColumns = hasRun ? measuredColumnsFor({ compared, shelf }) : [];
  const { page, setPage, pageCount, from, to } = useTablePage(prompts.length, {
    pageSize: PAGE_SIZE,
    resetKey,
    urlKey: 'page',
  });
  const pagedPrompts = prompts.slice(from - 1, to);
  const pageIds = pagedPrompts.map((prompt) => prompt.id);
  const navigate = useNavigate();
  const projectHref = useProjectHref();

  return (
    <DataTable
      label="Prompts"
      columns={promptColumns(measuredColumns, actions !== undefined)}
      pageSize={PAGE_SIZE}
      rowCount={pagedPrompts.length}
      rowLines={2}
      selection={
        selection
          ? {
              all: pageTicked(pageIds, selection.ids),
              onAllChange: (checked) => selection.togglePage(pageIds, checked),
              noun: 'prompts on this page',
            }
          : undefined
      }
      state={emptyState(prompts.length, onClearFilters)}
      pager={{
        range: { from, to, total: prompts.length, noun: 'prompts' },
        ...pageNumberControls(page, pageCount, setPage),
      }}
    >
      {pagedPrompts.map((prompt) => {
        const openAnswer = answerOpener(prompt, measurements?.get(prompt.id), onOpenAnswer);
        return (
          <TableRow
            key={prompt.id}
            className="cursor-pointer"
            onClick={(event) => {
              if (!isRowSurfaceClick(event)) return;
              if (openAnswer) openAnswer();
              else void navigate(projectHref(promptHistoryHref(prompt.id)));
            }}
          >
            {selection ? (
              <TableSelectCell
                label={`Select “${prompt.text}”`}
                checked={selection.ids.has(prompt.id)}
                onCheckedChange={(checked, range) => selection.toggle(prompt.id, checked, range)}
              />
            ) : null}
            <TableCell>
              {/* The question is the keyboard's way in: two lines, or one over
                  a caption, its whole text in a tooltip. The caption names the
                  prompt's set when there are several brand sets, and says when
                  audits skip the prompt. */}
              <TableCellLines
                title
                wrap
                primary={<PromptQuestion prompt={prompt} openAnswer={openAnswer} />}
                secondary={rowCaption(prompt, setNames?.get(prompt.prompt_set_id))}
              />
            </TableCell>
            <TableCell>
              <TopicName topicId={prompt.topic_id} names={topicNames} />
            </TableCell>
            {hasRun && commerceSetIds?.has(prompt.prompt_set_id) ? (
              <ShelfMeasuredCells columns={measuredColumns} />
            ) : null}
            {hasRun && !commerceSetIds?.has(prompt.prompt_set_id) ? (
              <MeasuredCells measurement={measurements?.get(prompt.id)} compared={compared} />
            ) : null}
            {actions ? <PromptRowMenu prompt={prompt} actions={actions} /> : null}
          </TableRow>
        );
      })}
    </DataTable>
  );
}

/** The page's header box: every row on it ticked, some, or none. */
function pageTicked(
  pageIds: readonly string[],
  ids: ReadonlySet<string>,
): boolean | 'indeterminate' {
  const ticked = pageIds.filter((id) => ids.has(id)).length;
  if (ticked === 0) return false;
  return ticked === pageIds.length ? true : 'indeterminate';
}

/** The prompt's set, and whether audits skip it: disabled, or beyond the plan limit. */
function rowCaption(prompt: Prompt, setName: string | undefined): string | undefined {
  const parts = [
    setName,
    prompt.enabled || prompt.status === 'archived' ? '' : 'Disabled',
    prompt.over_plan_limit ? 'Beyond the plan limit' : '',
  ];
  return parts.filter(Boolean).join(' · ') || undefined;
}

/** Opens the latest run's answer to a measured prompt; nothing for an unmeasured one. */
function answerOpener(
  prompt: Prompt,
  measurement: PromptMeasurement | undefined,
  onOpenAnswer: ((prompt: Prompt, answer: PromptAnswerRef) => void) | undefined,
) {
  if (!measurement || !onOpenAnswer) return undefined;
  return () => onOpenAnswer(prompt, measurement.answer);
}

/**
 * The question links to its history; once a run has measured it, a plain click
 * opens the latest answer instead, and a modified click still opens the history.
 */
function PromptQuestion({
  prompt,
  openAnswer,
}: Readonly<{ prompt: Prompt; openAnswer: (() => void) | undefined }>) {
  return (
    <TextLink
      href={promptHistoryHref(prompt.id)}
      text="inherit"
      underline="hover"
      aria-haspopup={openAnswer ? 'dialog' : undefined}
      onClick={(event) => {
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (!openAnswer || event.button !== 0 || modified) return;
        event.preventDefault();
        openAnswer();
      }}
    >
      {prompt.text}
    </TextLink>
  );
}

/** The prompt's topic; a prompt filed under none says so, an unread topic list is unavailable. */
function TopicName({
  topicId,
  names,
}: Readonly<{ topicId: Prompt['topic_id']; names?: ReadonlyMap<string, string> }>) {
  if (!topicId) return <Absence state="none" label="No topic" />;
  const name = names?.get(topicId);
  if (name === undefined) return <Absence state="unavailable" />;
  return <ClampText className="text-ink-2">{name}</ClampText>;
}

/** The actions menu of one editable row. */
function PromptRowMenu({
  prompt,
  actions: { onEdit, onDelete, onToggleEnabled, onSetStatus },
}: Readonly<{
  prompt: Prompt;
  actions: PromptRowActions;
}>) {
  return (
    <TableActionsCell>
      <Menu>
        <MenuTrigger asChild>
          <IconButton icon={MoreHorizontal} label="Prompt actions" />
        </MenuTrigger>
        <MenuContent align="end">
          {prompt.status === 'archived' ? (
            <MenuItem icon={<Icon icon={Check} />} onSelect={() => onSetStatus(prompt, 'active')}>
              Restore
            </MenuItem>
          ) : null}
          <MenuItem icon={<Icon icon={Pencil} />} onSelect={() => onEdit(prompt)}>
            Edit
          </MenuItem>
          {/* An archived prompt shows only Archived, so its enabled state isn't offered. */}
          {prompt.status === 'archived' ? null : (
            <MenuItem icon={<Icon icon={Power} />} onSelect={() => onToggleEnabled(prompt)}>
              {prompt.enabled ? 'Disable' : 'Enable'}
            </MenuItem>
          )}
          {prompt.status === 'archived' ? null : (
            <MenuItem
              icon={<Icon icon={Archive} />}
              onSelect={() => onSetStatus(prompt, 'archived')}
            >
              Archive
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<Icon icon={Trash2} />} danger onSelect={() => onDelete(prompt)}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </TableActionsCell>
  );
}

/**
 * The measured columns are drawn only once a run exists; each hint says
 * exactly what its figure measures. Archived and disabled are the view tabs
 * and the Enabled filter, not a column. A reader who may not edit gets no menu.
 */
function promptColumns(
  measuredColumns: readonly DataTableColumn[],
  editable: boolean,
): DataTableColumn[] {
  const columns: DataTableColumn[] = [
    { key: 'prompt', label: 'Prompt', kind: 'identity', width: 'reading' },
    { key: 'topic', label: 'Topic', width: 'status' },
    ...measuredColumns,
  ];
  if (editable)
    columns.push({ key: 'actions', label: 'Actions', width: 'control', kind: 'actions' });
  return columns;
}

const VISIBILITY_COLUMN: DataTableColumn = {
  key: 'visibility',
  label: 'Visibility',
  width: 'figure',
  kind: 'number',
};

/** Said once, in the head, rather than on every shopping row. */
const SHELF_HINT =
  'Shopping prompts are measured with the shopping shelf on Shopping, not one prompt at a time, so their figures here are not applicable.';

/** The visibility's movement since the last run, beside the visibility. */
const CHANGE_COLUMN: DataTableColumn = {
  key: 'change',
  label: 'Change',
  width: 'figure',
  kind: 'number',
  priority: 'low',
};

/**
 * Each mark column sits beside the figure it explains (the brands named after
 * Visibility, the cited sites after Citations); the low-priority figures come
 * last and hide, the last first, where the frame is too narrow.
 */
const MEASURED_COLUMNS: readonly DataTableColumn[] = [
  {
    key: 'mentions',
    label: 'Mentions',
    width: 'marks',
    hint: "The brands named in this prompt's answers: yours and your competitors'.",
  },
  {
    key: 'citations',
    label: 'Citations',
    width: 'figure',
    kind: 'number',
    hint: "The share of this prompt's answers that cited one of your pages.",
  },
  {
    key: 'sources',
    label: 'Sources',
    width: 'marks',
    hint: "The sites this prompt's answers cited, most citations first.",
  },
  {
    key: 'position',
    label: 'Position',
    width: 'figure',
    kind: 'number',
    priority: 'low',
    hint: 'Where your brand was named among the brands in an answer, averaged over the answers that named it.',
  },
  {
    key: 'sov',
    label: 'Share of voice',
    width: 'figure',
    kind: 'number',
    priority: 'low',
    hint: SHARE_OF_VOICE_HINT,
  },
  {
    key: 'sentiment',
    label: 'Sentiment',
    width: 'figure',
    kind: 'number',
    priority: 'low',
    hint: "Net sentiment toward your brand in this prompt's answers: positive minus negative mentions, as a share of the classified ones.",
  },
];

function measuredColumnsFor({
  compared,
  shelf,
}: Readonly<{ compared: boolean; shelf: boolean }>): readonly DataTableColumn[] {
  const visibility = shelf ? { ...VISIBILITY_COLUMN, hint: SHELF_HINT } : VISIBILITY_COLUMN;
  return [visibility, ...(compared ? [CHANGE_COLUMN] : []), ...MEASURED_COLUMNS];
}

/** A rate: unmeasured without a measurement, unavailable when the measurement had no answers. */
function RateValue({
  measurement,
  rate,
}: Readonly<{ measurement?: PromptMeasurement; rate?: number | null }>) {
  if (!measurement) return NOT_MEASURED;
  return rate == null ? NO_ANSWERS : formatRate(rate);
}

/** A prompt's visibility and its movement, its marks, then the low-priority figures. */
function MeasuredCells({
  measurement,
  compared,
}: Readonly<{ measurement?: PromptMeasurement; compared: boolean }>) {
  return (
    <>
      <TableCell numeric>
        <RateValue measurement={measurement} rate={measurement?.visibilityRate} />
      </TableCell>
      {compared ? (
        <TableCell numeric>
          <ChangeValue change={measurement?.change} />
        </TableCell>
      ) : null}
      <TableCell>
        {measurement ? (
          <NamedBrandMarks
            brands={measurement.brands}
            total={measurement.mentions}
            answers="this prompt's answers"
          />
        ) : (
          NOT_MEASURED
        )}
      </TableCell>
      <TableCell numeric>
        <RateValue measurement={measurement} rate={measurement?.ownedCitationRate} />
      </TableCell>
      <TableCell>
        {measurement ? (
          <CitedDomainMarks
            sources={measurement.visibilityRate === null ? null : measurement.sources}
          />
        ) : (
          NOT_MEASURED
        )}
      </TableCell>
      <FigureCells measurement={measurement} />
    </>
  );
}

/** Average position, share of voice and sentiment. */
function FigureCells({ measurement }: Readonly<{ measurement?: PromptMeasurement }>) {
  return (
    <>
      <TableCell numeric>
        <AveragePosition measurement={measurement} />
      </TableCell>
      <TableCell numeric>
        <ShareOfVoice measurement={measurement} />
      </TableCell>
      <TableCell numeric>
        {measurement?.sentiment ? (
          <SentimentValue sentiment={measurement.sentiment} tooFew="Too few" showCount={false} />
        ) : (
          NOT_MEASURED
        )}
      </TableCell>
    </>
  );
}

/** No answers is unavailable; answers naming no tracked brand is none. */
function ShareOfVoice({ measurement }: Readonly<{ measurement?: PromptMeasurement }>) {
  if (!measurement) return NOT_MEASURED;
  if (measurement.visibilityRate === null) return NO_ANSWERS;
  return (
    measured(formatRate(measurement.shareOfVoice)) ?? (
      <Absence state="none" reason="No tracked brand was named in these answers." />
    )
  );
}

/** The average position; never named and an unrecorded order stay apart from no run. */
function AveragePosition({ measurement }: Readonly<{ measurement?: PromptMeasurement }>) {
  if (!measurement) return NOT_MEASURED;
  if (measurement.position === null) return positionAbsence(measurement.visibilityRate);
  const position = formatPositionExact(measurement.position);
  return <span title={`Average of ${position} across this prompt's answers`}>{position}</span>;
}

/**
 * A Commerce prompt is measured as part of the shopping shelf, never on its
 * own: its figures do not apply here (a known gap, not a missing run). Each
 * value position holds the dash with the reason as its name; the Visibility
 * head's hint says why.
 */
function ShelfMeasuredCells({ columns }: Readonly<{ columns: readonly DataTableColumn[] }>) {
  return columns.map((column) => (
    <TableCell key={column.key} numeric={column.kind === 'number'}>
      <Absence state="not_applicable" label="Measured with Shopping" />
    </TableCell>
  ));
}

const NOT_COMPARED = {
  changed_context:
    'Not comparable with its previous measurement: the run settings or prompt changed.',
  no_observations: 'Not comparable with its previous measurement: one of the runs had no answers.',
} as const satisfies Record<Extract<PromptChange, { kind: 'not_compared' }>['reason'], string>;

/** The change since the prompt's previous measurement, or why there is none. */
function ChangeValue({ change }: Readonly<{ change?: PromptChange }>) {
  if (change === undefined) return NOT_MEASURED;
  switch (change.kind) {
    case 'delta':
      return <Delta value={change.points} unit=" pp" />;
    case 'first':
      return (
        <Absence state="not_applicable" reason="First measurement: nothing earlier to compare." />
      );
    case 'not_compared':
      return <Absence state="unavailable" label="Unknown" reason={NOT_COMPARED[change.reason]} />;
    default: {
      const unhandled: never = change;
      return unhandled;
    }
  }
}
