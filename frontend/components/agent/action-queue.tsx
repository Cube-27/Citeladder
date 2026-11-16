import { choiceFilter, type FilterDefinition } from '@/components/ui/all-filters';
import { ISSUES_SOURCE } from '@/lib/agent/action-list';
import { ACTION_FAMILIES, PRIORITY_BAND_LABEL, familyLabel } from '@/lib/agent/vocabulary';
import type { ActionListView, ActionPriorityBand } from '@/lib/api/actions';
import { setUrlParams, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { actionPriorityBandSchema } from '@citeladder/contracts/actions';

/**
 * The Actions list's view, all URL state: the status view (Open by default),
 * the Source and Priority filters, and whether the tree groups by goal or by
 * source.
 */

/** The status views in the segmented control's order, with their labels. */
export const ACTION_LIST_VIEW_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'measuring', label: 'Measuring' },
  { value: 'done', label: 'Done' },
  { value: 'dismissed', label: 'Dismissed' },
] as const satisfies readonly { value: ActionListView; label: string }[];

const ALL = 'all';
type GroupBy = 'goal' | 'source';

const VIEW_CODEC = stringUrlCodec<ActionListView>(
  ACTION_LIST_VIEW_OPTIONS.map((option) => option.value),
  'open',
);
const SOURCE_CODEC = stringUrlCodec<string>([ALL, ISSUES_SOURCE, ...ACTION_FAMILIES], ALL);
const PRIORITY_CODEC = stringUrlCodec<ActionPriorityBand | typeof ALL>(
  [ALL, ...actionPriorityBandSchema.options],
  ALL,
);
const GROUP_BY_CODEC = stringUrlCodec<GroupBy>(['goal', 'source'], 'goal');

export function useActionFilters() {
  const [view, setView] = useUrlState('status', VIEW_CODEC, { history: 'replace' });
  const [source, setSource] = useUrlState('source', SOURCE_CODEC, { history: 'replace' });
  const [priority, setPriority] = useUrlState('priority', PRIORITY_CODEC, { history: 'replace' });
  const [groupBy, setGroupBy] = useUrlState('group_by', GROUP_BY_CODEC, { history: 'replace' });
  const definitions: FilterDefinition[] = [
    choiceFilter<string>({
      id: 'source',
      label: 'Source',
      value: source,
      defaultValue: ALL,
      defaultIsEvery: true,
      groups: [
        {
          options: [
            { value: ALL, label: 'All sources' },
            { value: ISSUES_SOURCE, label: 'Issues' },
            ...ACTION_FAMILIES.map((family) => ({
              value: family,
              label: familyLabel(family) ?? family,
            })),
          ],
        },
      ],
      onChange: setSource,
    }),
    choiceFilter<ActionPriorityBand | typeof ALL>({
      id: 'priority',
      label: 'Priority',
      value: priority,
      defaultValue: ALL,
      defaultIsEvery: true,
      groups: [
        {
          options: [
            { value: ALL, label: 'All priorities' },
            ...actionPriorityBandSchema.options.map((band) => ({
              value: band,
              label: PRIORITY_BAND_LABEL[band],
            })),
          ],
        },
      ],
      onChange: setPriority,
    }),
    choiceFilter<GroupBy>({
      id: 'group_by',
      label: 'Group by',
      value: groupBy,
      defaultValue: 'goal',
      groups: [
        {
          options: [
            { value: 'goal', label: 'Goal' },
            { value: 'source', label: 'Source' },
          ],
        },
      ],
      onChange: setGroupBy,
    }),
  ];
  return {
    definitions,
    view,
    setView,
    /** `issues`, an evidence family, or undefined for every source. */
    source: source === ALL ? undefined : source,
    priority: priority === ALL ? undefined : priority,
    groupBy,
    filtered: source !== ALL || priority !== ALL,
    // Both filters back to every value in one write: a router navigation lands
    // later, so a setter per filter would build on the stale address.
    clear: () => setUrlParams({ source: null, priority: null }, 'replace'),
  };
}
