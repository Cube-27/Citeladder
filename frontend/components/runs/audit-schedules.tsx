import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CalendarPlus, Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Absence } from '@/components/ui/absence';
import { runsMutations, runsQueries } from '@/lib/api/runs';
import { mainPromptSet } from '@/lib/prompts/prompt-sets';
import { toggleMarket } from '@/lib/runs/launch';
import type { ProjectMarket } from '@citeladder/contracts/markets';
import type {
  AuditSchedule,
  AuditScheduleCadence,
  LogicalEngine,
  PromptSet,
} from '@citeladder/contracts';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { DisplayTime } from '@/components/ui/display-time';
import { textRole } from '@/components/ui/typography';
import { Inline, Stack } from '@/components/ui/layout';
import { LedgerItem, LedgerList } from '@/components/ui/ledger-list';
import { StatusMark } from '@/components/ui/status-mark';
import { insetClasses } from '@/components/ui/workspace';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { useProjectMarkets } from '@/lib/project/use-project-markets';
import { useEngineCatalog } from '@/lib/providers/engines';
import { schedulePauseReason } from '@/lib/runs/status';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { SectionContent, TitledSection } from '@/components/ui/section';

const CADENCE_LABELS: Record<AuditScheduleCadence, string> = {
  one_time: 'One time',
  every_n_minutes: 'Every N minutes',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
};

const SCOPE_LABELS: Record<AuditSchedule['audit_scope'], string> = {
  brand: 'Brand visibility',
  commerce: 'Commerce AI Shelf',
};

/** Compact schedule ledger: schedules use the same frozen prompt set and engines as a run. */
export function AuditSchedules({
  projectId,
  promptSets,
}: Readonly<{ projectId: string; promptSets: PromptSet[] }>) {
  const { workspaceId } = useProjectScope();
  return (
    <WorkspaceSchedules workspaceId={workspaceId} projectId={projectId} promptSets={promptSets} />
  );
}

function WorkspaceSchedules({
  workspaceId,
  projectId,
  promptSets,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  promptSets: PromptSet[];
}>) {
  const scope = { workspaceId, projectId };
  const schedulesQuery = useQuery(runsQueries.schedules(scope));
  const markets = useProjectMarkets(projectId, workspaceId);
  const resumeMutation = useMutation(runsMutations.resumeSchedule(scope));
  const canWrite = useWorkspaceCapability('write');

  return (
    <div data-settings-sections="">
      <TitledSection
        title="Scheduled audits"
        description="Runs use the selected prompt set and your connected engines."
      >
        <SectionContent>
          {/* The schedules on the left, the new-schedule form in a 360 panel beside them. */}
          <Stack className="column-split:grid-cols-[minmax(0,1fr)_360px] column-split:items-start">
            <Stack>
              {schedulesQuery.isError ? (
                <Notice
                  kind="read"
                  {...readErrorProps(schedulesQuery)}
                  title="Couldn't load the scheduled runs"
                  fallback="The request failed or timed out."
                />
              ) : null}
              {schedulesQuery.data?.length ? (
                <LedgerList>
                  {schedulesQuery.data.map((schedule) => (
                    <ScheduleRow
                      key={schedule.id}
                      schedule={schedule}
                      promptSets={promptSets}
                      markets={markets}
                      resuming={resumeMutation.isPending}
                      onResume={canWrite ? () => resumeMutation.mutate(schedule.id) : undefined}
                    />
                  ))}
                </LedgerList>
              ) : null}
              {schedulesQuery.isSuccess && schedulesQuery.data.length === 0 ? (
                <StateBlock kind="empty" inline message="No scheduled audits yet." />
              ) : null}
              <ResumeNotice
                error={resumeMutation.error}
                onRetry={() => {
                  if (resumeMutation.variables) resumeMutation.mutate(resumeMutation.variables);
                }}
              />
            </Stack>
            {/* Scheduling is offered only to a role that may write schedules. */}
            {canWrite ? (
              <ScheduleForm scope={scope} promptSets={promptSets} markets={markets} />
            ) : null}
          </Stack>
        </SectionContent>
      </TitledSection>
    </div>
  );
}

/** The new-schedule form and its outcome, for a role that may write schedules. */
function ScheduleForm({
  scope,
  promptSets,
  markets,
}: Readonly<{
  scope: Readonly<{ workspaceId: string; projectId: string }>;
  promptSets: PromptSet[];
  markets: readonly ProjectMarket[];
}>) {
  const catalog = useEngineCatalog();
  const [promptSetId, setPromptSetId] = useState(mainPromptSet(promptSets)?.id ?? '');
  const [auditScope, setAuditScope] = useState<'brand' | 'commerce'>('brand');
  const [cadence, setCadence] = useState<AuditScheduleCadence>('weekly');
  const [intervalMinutes, setIntervalMinutes] = useState('60');
  const [engines, setEngines] = useState<LogicalEngine[]>(['chatgpt']);
  const [marketIds, setMarketIds] = useState<(string | null)[]>([null]);
  const createMutation = useMutation(runsMutations.createSchedule(scope));
  const createSchedule = () =>
    createMutation.mutate({
      prompt_set_id: promptSetId,
      audit_scope: auditScope,
      cadence,
      interval_minutes: cadence === 'every_n_minutes' ? Number(intervalMinutes) : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      engines,
      market_ids: marketIds,
    });
  // The engine choices come from the catalogue; until it loads none are shown,
  // so nothing may be scheduled against an engine the user cannot see.
  const canCreate =
    !createMutation.isPending &&
    catalog.order.length > 0 &&
    scheduleReady(promptSetId, engines, marketIds);

  return (
    <Stack>
      {/* The Runs screen mounts schedules only once an active prompt exists. */}
      <div className={insetClasses()}>
        <Stack gap="workspace">
          <Field label="Prompt set">
            {({ id }) => (
              <Select
                id={id}
                ariaLabel="Prompt set"
                value={promptSetId}
                onValueChange={setPromptSetId}
                options={promptSets.map((set) => ({ value: set.id, label: set.name }))}
              />
            )}
          </Field>
          <Field label="Measurement scope">
            {({ id }) => (
              <Select
                id={id}
                ariaLabel="Measurement scope"
                value={auditScope}
                onValueChange={setAuditScope}
                options={Object.entries(SCOPE_LABELS).map(([value, label]) => ({
                  value: value as AuditSchedule['audit_scope'],
                  label,
                }))}
              />
            )}
          </Field>
          <Field label="Cadence">
            {({ id }) => (
              <Select
                id={id}
                ariaLabel="Cadence"
                value={cadence}
                onValueChange={setCadence}
                options={Object.entries(CADENCE_LABELS).map(([value, label]) => ({
                  value: value as AuditScheduleCadence,
                  label,
                }))}
              />
            )}
          </Field>
          {cadence === 'every_n_minutes' ? (
            <Field label="Minutes">
              {(props) => (
                <Input
                  {...props}
                  min="5"
                  type="number"
                  value={intervalMinutes}
                  onChange={(event) => setIntervalMinutes(event.target.value)}
                />
              )}
            </Field>
          ) : null}
          <Stack as="fieldset" gap="item">
            <legend className={textRole('label')}>Engines</legend>
            <Inline className="flex-wrap">
              {catalog.order.map((engine) => (
                <Checkbox
                  key={engine}
                  label={catalog.label(engine)}
                  checked={engines.includes(engine)}
                  onCheckedChange={() =>
                    setEngines((current) =>
                      current.includes(engine)
                        ? current.filter((value) => value !== engine)
                        : [...current, engine],
                    )
                  }
                />
              ))}
            </Inline>
          </Stack>
          <MarketChecklist markets={markets} marketIds={marketIds} onToggle={setMarketIds} />
          <div className="flex justify-end">
            {/* The masthead's Launch run is the page's one primary. */}
            <Button variant="secondary" onClick={createSchedule} disabled={!canCreate}>
              <Icon icon={CalendarPlus} />
              {createMutation.isPending ? 'Scheduling…' : 'Schedule audit'}
            </Button>
          </div>
        </Stack>
      </div>
      {createMutation.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(createMutation.error, {
            action: 'schedule the audit',
          })}
          onRetry={createSchedule}
        />
      ) : null}
    </Stack>
  );
}

const scheduleReady = (
  promptSetId: string,
  engines: readonly LogicalEngine[],
  marketIds: readonly (string | null)[],
) => Boolean(promptSetId) && engines.length > 0 && marketIds.length > 0;

/** Which markets each occurrence measures; offered once a project has more than its default. */
function MarketChecklist({
  markets,
  marketIds,
  onToggle,
}: Readonly<{
  markets: readonly ProjectMarket[];
  marketIds: (string | null)[];
  onToggle: React.Dispatch<React.SetStateAction<(string | null)[]>>;
}>) {
  if (markets.length < 2) return null;
  return (
    <Stack as="fieldset" gap="item">
      <legend className={textRole('label')}>Markets</legend>
      <Inline className="flex-wrap">
        {markets.map((market) => (
          <Checkbox
            key={market.id ?? 'default'}
            label={market.label}
            checked={marketIds.includes(market.id)}
            onCheckedChange={() => onToggle((current) => toggleMarket(current, market.id))}
          />
        ))}
      </Inline>
    </Stack>
  );
}

const finishedOnce = (schedule: AuditSchedule) =>
  schedule.cadence === 'one_time' && !schedule.next_run_at && !schedule.failure_count;

const cadenceLabel = (schedule: AuditSchedule) =>
  schedule.cadence === 'every_n_minutes' && schedule.interval_minutes
    ? `Every ${schedule.interval_minutes} minutes`
    : CADENCE_LABELS[schedule.cadence];

/** The schedule's markets by label, or nothing while the project has only its default. */
function marketSummary(schedule: AuditSchedule, markets: readonly ProjectMarket[]): string {
  if (markets.length < 2) return '';
  const labels = schedule.market_ids.map(
    (id) => markets.find((market) => market.id === id)?.label ?? 'Removed market',
  );
  return ` · ${labels.join(', ')}`;
}

function ScheduleStatus({ schedule }: Readonly<{ schedule: AuditSchedule }>) {
  if (schedule.enabled) {
    return (
      <>
        Next run{' '}
        {schedule.next_run_at ? (
          <DisplayTime value={schedule.next_run_at} />
        ) : (
          <Absence state="not_set" />
        )}
      </>
    );
  }
  if (finishedOnce(schedule)) return 'Ran once';
  const reason = schedule.failure_count ? schedulePauseReason(schedule.last_error) : '';
  return (
    <Inline as="span" gap="item">
      <StatusMark variant="run-status" value="paused">
        Paused
      </StatusMark>
      {reason ? <span>{reason.charAt(0).toUpperCase() + reason.slice(1)}</span> : null}
    </Inline>
  );
}

function ScheduleRow({
  schedule,
  promptSets,
  markets,
  resuming,
  onResume,
}: Readonly<{
  schedule: AuditSchedule;
  promptSets: readonly PromptSet[];
  markets: readonly ProjectMarket[];
  resuming: boolean;
  /** Resumes a paused schedule; omitted for a role that may not. */
  onResume?: () => void;
}>) {
  const catalog = useEngineCatalog();
  // A one-time schedule that ran is finished, not paused; resuming would run it again.
  const resumable = !schedule.enabled && !finishedOnce(schedule) && onResume;
  const promptSet =
    promptSets.find((set) => set.id === schedule.prompt_set_id)?.name ?? 'Removed prompt set';
  return (
    <LedgerItem
      title={
        <>
          <span className={textRole('emphasis')}>{cadenceLabel(schedule)}</span>
          {` · ${promptSet} · ${SCOPE_LABELS[schedule.audit_scope]} · `}
          {schedule.engines.map(catalog.label).join(', ')}
          {marketSummary(schedule, markets)}
        </>
      }
      caption={<ScheduleStatus schedule={schedule} />}
      action={
        resumable ? (
          <Button variant="secondary" disabled={resuming} onClick={onResume}>
            <Icon icon={Play} />
            Resume
          </Button>
        ) : undefined
      }
    />
  );
}

function ResumeNotice({ error, onRetry }: Readonly<{ error: Error | null; onRetry: () => void }>) {
  if (!error) return null;
  return (
    <Notice
      kind="mutation"
      notice={mutationNoticeForError(error, { action: 'resume the schedule' })}
      onRetry={onRetry}
    />
  );
}
