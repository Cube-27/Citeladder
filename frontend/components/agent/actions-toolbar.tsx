import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { AnalyzePageDialog } from '@/components/agent/analyze-page-dialog';
import {
  GROUP_BY_OPTIONS,
  STATUS_OPTIONS,
  type StatusChoice,
} from '@/components/agent/use-action-filters';
import type { ActionsView } from '@/components/agent/use-actions-page';
import { Button } from '@/components/ui/button';
import { FilterChoice, type FilterBarProps } from '@/components/ui/filter-bar';
import { FilterTrigger } from '@/components/ui/filter-chip';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { Check, ChevronDown, Plus } from '@/lib/icons';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { actionsMutations } from '@/lib/api/actions';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { pluralCount } from '@/lib/format';
import { useProjectHref } from '@/lib/navigation/project-destination';

const CREATE_PROMPT = 'Create an action for';
const WORK_PROMPT =
  'Help me work through my open actions, starting with what blocks AI from reading my site.';

export function actionsToolbar({
  scope,
  view,
  newCount,
}: Readonly<{
  scope: ProjectScope;
  view: ActionsView;
  newCount: number | undefined;
}>): FilterBarProps {
  return {
    lead: (
      <Inline wrap>
        <FilterChoice<StatusChoice>
          label="Status"
          value={view.status}
          defaultValue="all"
          options={STATUS_OPTIONS}
          onChange={view.setStatus}
        />
        <GroupByMenu view={view} />
      </Inline>
    ),
    filters: view.definitions,
    actions: (
      <>
        <CreateMenu />
        <AcceptAll scope={scope} view={view} newCount={newCount} />
      </>
    ),
  };
}

function GroupByMenu({ view }: Readonly<{ view: ActionsView }>) {
  const current = GROUP_BY_OPTIONS.find((option) => option.value === view.groupBy);
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterTrigger label="Group by" value={current?.label} active={view.groupBy !== 'goal'} />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Group by</MenuLabel>
        <MenuRadioGroup value={view.groupBy}>
          {GROUP_BY_OPTIONS.map((option) => (
            <MenuRadioItem
              key={option.value}
              value={option.value}
              onSelect={() => view.setGroupBy(option.value)}
            >
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

export function CreateMenu() {
  const [analyzing, setAnalyzing] = useState(false);
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const toAgent = (prompt: string) => navigate(projectHref(agentHandoffHref({ prompt })));
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button>
            <Icon icon={Plus} />
            Create action
            <Icon icon={ChevronDown} />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={() => toAgent(CREATE_PROMPT)}>Create action</MenuItem>
          <MenuItem onSelect={() => setAnalyzing(true)}>Analyze a page</MenuItem>
          <MenuItem onSelect={() => toAgent(WORK_PROMPT)}>Work with agent</MenuItem>
        </MenuContent>
      </Menu>
      {analyzing ? <AnalyzePageDialog onClose={() => setAnalyzing(false)} /> : null}
    </>
  );
}

function AcceptAll({
  scope,
  view,
  newCount,
}: Readonly<{ scope: ProjectScope; view: ActionsView; newCount: number | undefined }>) {
  const accept = useMutation(actionsMutations.bulkStatus(scope));
  const toast = useToast();
  const failed = (title: string) => () =>
    toast.notify(title, 'Nothing was changed.', { tone: 'negative' });
  const undo = (ids: readonly string[]) =>
    accept.mutate(
      { to: 'open', ids: [...ids] },
      {
        onSuccess: (result) =>
          toast.notify(`${pluralCount(result.updated, 'action')} moved back to New`),
        onError: failed("Couldn't undo the accept"),
      },
    );
  const run = () =>
    accept.mutate(
      { to: 'in_progress', filter: { status: 'open', ...view.filters } },
      {
        onSuccess: (result) =>
          toast.notify(`${pluralCount(result.updated, 'action')} moved to In progress`, undefined, {
            actions: [
              ...(result.moved_ids.length
                ? [{ label: 'Undo', onClick: () => undo(result.moved_ids) }]
                : []),
              ...(result.truncated ? [{ label: 'Accept remaining', onClick: run }] : []),
            ],
          }),
        onError: failed("Couldn't accept these actions"),
      },
    );
  return (
    <Button variant="primary" onClick={run} pending={accept.isPending} disabled={!newCount}>
      <Icon icon={Check} />
      {newCount ? `Accept ${pluralCount(newCount, 'action')}` : 'Accept actions'}
    </Button>
  );
}
