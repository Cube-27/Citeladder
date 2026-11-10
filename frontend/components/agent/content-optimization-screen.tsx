'use client';

import {
  ActionStatusSelect,
  useActionStatusFilter,
  useActionTable,
  workSummary,
} from '@/components/agent/action-queue';
import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import { ListScreen } from '@/components/layout/page-shell';
import { Callout, type CalloutTone } from '@/components/ui/callout';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Inline } from '@/components/ui/layout';
import { TextLink } from '@/components/ui/text-link';
import { ClampText, TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { MissingValue } from '@/components/ui/unavailable-value';
import type { ActionListItem, ActionsPage, ActionStatus } from '@/lib/api/actions';
import { formatCount, readableUrl } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { useProjectScope } from '@/lib/project/active-project-scope';
import type { ContentGapSourceState } from '@citeladder/contracts/actions';
import { actionPath } from '@citeladder/contracts/record-kinds';

/**
 * Content optimization: the Actions on content pages and on pages to create
 * for a content gap (CO1, CO10), ordered by deterministic priority like
 * Actions, which never lists them. Each row states its angle and counts from
 * evidence, never a score (CO14).
 */
export function ContentOptimizationScreen() {
  const { workspaceId, projectId } = useProjectScope();
  const { filter, setFilter, status } = useActionStatusFilter();
  return (
    <ListScreen
      controls={{
        filters: (
          <ActionStatusSelect
            surface="content"
            value={filter}
            onValueChange={(value) => setFilter(value, 'replace')}
          />
        ),
      }}
    >
      <ContentList workspaceId={workspaceId} projectId={projectId} status={status} />
    </ListScreen>
  );
}

function ContentList({
  workspaceId,
  projectId,
  status,
}: Readonly<{ workspaceId: string; projectId: string; status: ActionStatus | undefined }>) {
  const { page, table } = useActionTable({
    workspaceId,
    projectId,
    surface: 'content',
    status,
    noun: 'Content Actions',
    empty: emptyContent,
  });
  // Rows without current gap evidence are still listed (Site Health work on
  // content pages), so the evidence state is said above them; an empty list
  // says it as its empty state instead.
  const source = page?.items.length
    ? SOURCE_NOTICES[page.content_gap_source ?? 'not_computed']
    : null;
  return (
    <>
      {source ? (
        <Callout tone={source.tone} title={source.heading}>
          {source.description}
        </Callout>
      ) : null}
      {/* Rows stack the page over its work summary, as on Actions. */}
      <DataTable label="Content optimization" columns={COLUMNS} rowLines={2} {...table}>
        {page?.items.map((action) => (
          <ContentRow
            key={action.id}
            action={action}
            showStatus={status === undefined && action.status !== 'open'}
          />
        ))}
      </DataTable>
    </>
  );
}

// No status column, as on Actions: the queue is nearly all Open, so a row
// names its status beside the page only when it differs. The counts are the
// lead angle's, its most cited.
const COLUMNS: readonly DataTableColumn[] = [
  { key: 'page', label: 'Page' },
  { key: 'angle', label: 'Angle', width: 'name' },
  {
    key: 'prompts',
    label: 'Prompts',
    width: 'figure',
    numeric: true,
    hint: 'Tracked prompts whose AI answers cited pages on the lead angle.',
  },
  {
    key: 'sources',
    label: 'Cited sources',
    width: 'metric',
    numeric: true,
    hint: 'Competitor and publisher sites AI answers cited for the lead angle, and how many of them are competitors.',
  },
];

type SourceNotice = Readonly<{ tone: CalloutTone; heading: string; description: string }>;

/**
 * What the list says about content gaps that are not current: the same
 * finding as a notice above rows and as the empty state of an empty list.
 */
const SOURCE_NOTICES: Readonly<Record<ContentGapSourceState, SourceNotice | null>> = {
  current: null,
  out_of_date: {
    tone: 'warning',
    heading: 'Content gap evidence is out of date',
    description:
      'The newest visibility run behind it is too old to use, so no content gaps are listed. Run a visibility audit to refresh it.',
  },
  not_computed: {
    tone: 'info',
    heading: 'Content gaps not computed yet',
    description:
      'They are found from the competitor and publisher pages AI answers cite, after a visibility run completes.',
  },
};

/**
 * What an empty list says. Content gaps never computed or evidence too old
 * to use come first, since no status would show a gap; then a filter that
 * excludes every row, and a current run with no gaps. Four different
 * findings, never one "nothing here".
 */
function emptyContent(page: ActionsPage): DataTableState {
  const empty = (heading: string, description: string): DataTableState => ({
    kind: 'empty',
    icon: ICONS.content,
    headingLevel: 3,
    heading,
    description,
  });
  const source = SOURCE_NOTICES[page.content_gap_source ?? 'not_computed'];
  if (source) return empty(source.heading, source.description);
  if (Object.values(page.status_counts).some((count) => count > 0))
    return empty(
      'No content work matches this status',
      'Change the status to see other content work.',
    );
  return empty(
    'No content gaps',
    'Your latest visibility runs show no content angle that competitor or publisher pages are cited for and your site lacks.',
  );
}

const NOT_A_GAP = 'No content gap on this page';

function ContentRow({
  action,
  showStatus,
}: Readonly<{ action: ActionListItem; showStatus: boolean }>) {
  // The most cited angle leads, and the counts are its own; the others are named by count.
  const [gap, ...more] = action.content_gaps ?? [];
  // A page to create is named by its topic, as on Actions; its summary says it is planned.
  const page = readableUrl(action.target_label);
  return (
    <TableRow>
      <TableCell>
        <div className="grid min-w-0">
          <Inline>
            <ClampText lines={1} tooltip={page}>
              <TextLink href={actionPath(action)} text="itemTitle">
                {page}
              </TextLink>
            </ClampText>
            {showStatus ? <ActionStatusBadge status={action.status} /> : null}
          </Inline>
          <ClampText lines={1} className={textRole('caption')}>
            {workSummary(action)}
          </ClampText>
        </div>
      </TableCell>
      <TableCell>
        {gap ? (
          <div className="grid min-w-0">
            <ClampText lines={1} tooltip={gap.angle_label}>
              {gap.angle_label}
            </ClampText>
            {more.length > 0 ? (
              <span className={textRole('caption')}>
                Lead angle · {formatCount(more.length)} more{' '}
                {more.length === 1 ? 'angle' : 'angles'}
              </span>
            ) : null}
          </div>
        ) : (
          <MissingValue state="not_applicable" reason={NOT_A_GAP} />
        )}
      </TableCell>
      <TableCell numeric>
        {gap ? (
          formatCount(gap.prompt_count)
        ) : (
          <MissingValue state="not_applicable" reason={NOT_A_GAP} />
        )}
      </TableCell>
      <TableCell numeric>
        {gap ? (
          <div className="grid">
            <span>
              {formatCount(gap.domain_count)} {gap.domain_count === 1 ? 'site' : 'sites'}
            </span>
            <span className={textRole('caption')}>
              {formatCount(gap.competitor_count)}{' '}
              {gap.competitor_count === 1 ? 'competitor' : 'competitors'}
            </span>
          </div>
        ) : (
          <MissingValue state="not_applicable" reason={NOT_A_GAP} />
        )}
      </TableCell>
    </TableRow>
  );
}
