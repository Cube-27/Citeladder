import { z } from 'zod';
import { auditRuntime } from '../audits/config.ts';
import { estimateAudit } from '../audits/estimate.ts';
import { auditLaunchDraft, auditLaunchInput } from '../audits/inputs.ts';
import { scheduleCreate } from '../audits/schedule-inputs.ts';
import { AUDITS_CANCEL, AUDITS_RUN, cancelAudit, launchAudit } from '../commands/audits.ts';
import { createSchedule, SCHEDULES_WRITE } from '../commands/schedules.ts';
import { changeKind, plural, type PreviewContext } from './kind.ts';
import { promptSetName } from './prompt-kinds.ts';

type LaunchRequest = z.output<typeof auditLaunchDraft>;

function estimate(context: PreviewContext, request: LaunchRequest) {
  return estimateAudit(
    context.db,
    context.workspaceId,
    {
      prompt_set_id: request.prompt_set_id ?? null,
      prompt_ids: request.prompt_ids,
      engines: request.engines,
      repetitions: request.repetitions ?? null,
      market_ids: request.market_ids,
      project_id: context.projectId,
    },
    auditRuntime(context.config.settings),
  );
}

export const auditKinds = {
  launch_audit: changeKind({
    permission: AUDITS_RUN,
    purpose:
      'launch an audit of a prompt set or chosen prompts on given engines; spends prompt runs when confirmed',
    payload: z.strictObject({ request: auditLaunchInput }),
    draft: {
      schema: z.strictObject({ request: auditLaunchDraft }),
      async complete(context, draft) {
        const estimated = await estimate(context, draft.request);
        return { request: { ...draft.request, max_attempts: estimated.maximum_attempt_count } };
      },
    },
    async execute(trx, config, actor, change, payload) {
      const audits = await launchAudit(trx, config, actor, change.projectId, payload.request);
      const launched =
        audits.length === 1 ? 'the audit' : `${audits.length} audits, one per market`;
      return {
        summary: `Launched ${launched}. Queued; runs start shortly.`,
        audits: audits.map((audit) => ({
          id: audit.id,
          status: audit.status,
          market: audit.market,
        })),
      };
    },
    async preview(context, payload) {
      const estimated = await estimate(context, payload.request);
      return {
        title:
          estimated.market_count === 1
            ? 'Launch an audit'
            : `Launch ${estimated.market_count} audits, one per market`,
        rows: [
          { label: 'Prompts', value: String(estimated.prompt_count) },
          { label: 'Engines', value: payload.request.engines.join(', ') },
          { label: 'Repetitions', value: String(estimated.repetition_count) },
          { label: 'Answers', value: String(estimated.execution_count) },
        ],
        spend: `Up to ${plural(estimated.execution_count, 'prompt run')}, in at most ${plural(payload.request.max_attempts, 'provider attempt')}`,
        opens: { label: 'Open Runs', path: '/runs' },
      };
    },
  }),
  cancel_audit: changeKind({
    permission: AUDITS_CANCEL,
    purpose: 'stop a queued or running audit; answers so far are kept',
    payload: z.strictObject({ audit_id: z.uuid() }),
    async execute(trx, _config, actor, change, payload) {
      await cancelAudit(trx, actor, change.projectId, payload.audit_id);
      return { summary: 'The audit was cancelled.' };
    },
    async preview(context, payload) {
      const audit = await context.db
        .selectFrom('audits')
        .select(['status', 'created_at'])
        .where('workspace_id', '=', context.workspaceId)
        .where('project_id', '=', context.projectId)
        .where('id', '=', payload.audit_id)
        .executeTakeFirst();
      return {
        title: 'Cancel an audit',
        rows: audit
          ? [
              { label: 'Started', value: audit.created_at.toISOString().slice(0, 16) },
              { label: 'Status', value: audit.status },
            ]
          : [],
        spend: null,
        opens: { label: 'Open Runs', path: '/runs' },
      };
    },
  }),
  schedule: changeKind({
    permission: SCHEDULES_WRITE,
    purpose: 'create a recurring audit schedule for a prompt set',
    payload: z.strictObject({ schedule: scheduleCreate }),
    async execute(trx, _config, actor, change, payload) {
      const schedule = await createSchedule(trx, actor, change.projectId, payload.schedule);
      return {
        summary: `Created a ${schedule.cadence} audit schedule.`,
        schedule: { id: schedule.id, next_run_at: schedule.next_run_at },
      };
    },
    async preview(context, payload) {
      const { schedule } = payload;
      return {
        title: `Create a ${schedule.cadence.replaceAll('_', ' ')} audit schedule`,
        rows: [
          { label: 'Prompt set', value: await promptSetName(context, schedule.prompt_set_id) },
          { label: 'Engines', value: schedule.engines.join(', ') },
          { label: 'Markets', value: String(schedule.market_ids.length) },
          { label: 'Timezone', value: schedule.timezone },
          { label: 'First run', value: schedule.next_run_at ?? 'Right away' },
        ],
        spend: 'Each scheduled run spends one prompt run per recorded answer',
        opens: null,
      };
    },
  }),
};
