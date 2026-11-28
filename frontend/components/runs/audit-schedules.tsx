import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SettingRow, SettingRows } from '@/components/ui/setting-row';
import { Select } from '@/components/ui/select';
import { Absence } from '@/components/ui/absence';
import { CalendarPlus, Play } from '@/lib/icons';
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
import { auditScheduleCadenceSchema } from '@citeladder/contracts';
import { DisplayTime } from '@/components/ui/display-time';
import { Text } from '@/components/ui/typography';
import { Inline, Stack, Columns } from '@/components/ui/layout';
import { ClampText } from '@/components/ui/clamp-text';
import { StatusMark } from '@/components/ui/status-mark';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { useProjectMarkets } from '@/lib/project/use-project-markets';
import { EngineLabel, EngineStack } from '@/components/ui/engine-mark';
import { useEngineCatalog } from '@/lib/providers/engines';
import { schedulePauseReason } from '@/lib/runs/status';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import {
  Section,
  SectionBleed,
  SectionHeader,
  SectionTitle,
  TitledSection,
} from '@/components/ui/section';

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
  probe: 'Market probe',
};
const CREATE_SCOPES = ['brand', 'commerce'] as const;

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
    <>
      <TitledSection title="Scheduled audits">
        {schedulesQuery.isError ? (
          <Notice
            kind="read"
            {...readErrorProps(schedulesQuery)}
            title="Couldn't load the scheduled runs"
            fallback="The request failed or timed out."
          />
        ) : null}
        {schedulesQuery.data?.length ? (
          <SectionBleed as="ul" rows>
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
          </SectionBleed>
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
      </TitledSection>
      {canWrite ? <ScheduleForm scope={scope} promptSets={promptSets} markets={markets} /> : null}
    </>
  );
}

function FormRow({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return <SettingRow label={label} control={children} />;
}

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
  const [promptSetId, setPromptSetId] = useState(() => mainPromptSet(promptSets)?.id ?? '');
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
  const canCreate =
    !createMutation.isPending &&
    catalog.order.length > 0 &&
    scheduleReady(promptSetId, engines, marketIds);

  return (
    <Section aria-labelledby="new-schedule-title">
      <SectionHeader>
        <SectionTitle id="new-schedule-title">New schedule</SectionTitle>
      </SectionHeader>
      <SettingRows
        density="roomy"
        label="New schedule"
        foot={
          <Button variant="secondary" onClick={createSchedule} disabled={!canCreate}>
            <Icon icon={CalendarPlus} />
            {createMutation.isPending ? 'Scheduling…' : 'Schedule audit'}
          </Button>
        }
      >
        <FormRow label="Prompt set">
          <Select
            ariaLabel="Prompt set"
            placeholder="Choose a prompt set"
            value={promptSetId}
            onValueChange={setPromptSetId}
            options={promptSets.map((set) => ({ value: set.id, label: set.name }))}
          />
        </FormRow>
        <FormRow label="Measurement scope">
          <Select
            ariaLabel="Measurement scope"
            value={auditScope}
            onValueChange={setAuditScope}
            options={CREATE_SCOPES.map((value) => ({ value, label: SCOPE_LABELS[value] }))}
          />
        </FormRow>
        <FormRow label="Cadence">
          <Select
            ariaLabel="Cadence"
            value={cadence}
            onValueChange={setCadence}
            options={auditScheduleCadenceSchema.options.map((value) => ({
              value,
              label: CADENCE_LABELS[value],
            }))}
          />
        </FormRow>
        {cadence === 'every_n_minutes' ? (
          <FormRow label="Minutes">
            <Input
              aria-label="Minutes"
              min="5"
              type="number"
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(event.target.value)}
            />
          </FormRow>
        ) : null}
        <FormRow label="Engines">
          <Columns as="fieldset" aria-label="Engines" template="choices" gap="choices">
            {catalog.order.map((engine) => (
              <Checkbox
                key={engine}
                label={<EngineLabel engine={engine} />}
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
          </Columns>
        </FormRow>
        <MarketChecklist markets={markets} marketIds={marketIds} onToggle={setMarketIds} />
      </SettingRows>
      <Notice
        kind="mutation"
        error={createMutation.error}
        act={'schedule the audit'}
        onRetry={createSchedule}
      />
    </Section>
  );
}

const scheduleReady = (
  promptSetId: string,
  engines: readonly LogicalEngine[],
  marketIds: readonly (string | null)[],
) => Boolean(promptSetId) && engines.length > 0 && marketIds.length > 0;

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
    <FormRow label="Markets">
      <Inline as="fieldset" aria-label="Markets" wrap>
        {markets.map((market) => (
          <Checkbox
            key={market.id ?? 'default'}
            label={market.label}
            checked={marketIds.includes(market.id)}
            onCheckedChange={() => onToggle((current) => toggleMarket(current, market.id))}
          />
        ))}
      </Inline>
    </FormRow>
  );
}

const finishedOnce = (schedule: AuditSchedule) =>
  schedule.cadence === 'one_time' && !schedule.next_run_at && !schedule.failure_count;

const cadenceLabel = (schedule: AuditSchedule) =>
  schedule.cadence === 'every_n_minutes' && schedule.interval_minutes
    ? `Every ${schedule.interval_minutes} minutes`
    : CADENCE_LABELS[schedule.cadence];

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
  onResume?: () => void;
}>) {
  const resumable = !schedule.enabled && !finishedOnce(schedule) && onResume;
  const promptSet =
    promptSets.find((set) => set.id === schedule.prompt_set_id)?.name ?? 'Removed prompt set';
  return (
    <Inline as="li" gap="loose">
      <Stack gap="tight" box="fill">
        <ClampText phoneWrap text="body">
          <Text variant="label">{cadenceLabel(schedule)}</Text>
          {` · ${promptSet} · ${SCOPE_LABELS[schedule.audit_scope]} · `}
          <EngineStack engines={schedule.engines} />
          {marketSummary(schedule, markets)}
        </ClampText>
        <ClampText phoneWrap text="caption">
          <ScheduleStatus schedule={schedule} />
        </ClampText>
      </Stack>
      {resumable ? (
        <Button variant="secondary" disabled={resuming} onClick={onResume}>
          <Icon icon={Play} />
          Resume
        </Button>
      ) : null}
    </Inline>
  );
}

function ResumeNotice({ error, onRetry }: Readonly<{ error: Error | null; onRetry: () => void }>) {
  if (!error) return null;
  return <Notice kind="mutation" error={error} act={'resume the schedule'} onRetry={onRetry} />;
}
