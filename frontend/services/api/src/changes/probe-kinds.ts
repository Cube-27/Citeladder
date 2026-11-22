import { z } from 'zod';
import { auditRuntime } from '../audits/config.ts';
import {
  deleteGroup,
  groupRequest,
  listGroups,
  mergeGroups,
  renameGroup,
} from '../probes/objection-groups.ts';
import { probePlan, runProbe, runnable } from '../probes/plan.ts';
import { setProbeSchedule } from '../probes/schedule.ts';
import {
  changeKind,
  countOf,
  MEMBER_RUN,
  MEMBER_WRITE,
  PERMANENT,
  plural,
  ROW_COUNT,
  type PreviewContext,
} from './kind.ts';

const PERCEPTION = { label: 'Open Perception', path: '/perception' };
const scopeOf = ({ workspaceId, projectId }: PreviewContext) => ({ workspaceId, projectId });

async function plan(context: PreviewContext) {
  return runnable(
    await probePlan(context.db, scopeOf(context), {
      runtime: auditRuntime(context.config.settings),
      at: new Date(),
    }),
  );
}

async function groupNames(context: PreviewContext) {
  const groups = await listGroups(context.db, scopeOf(context));
  return new Map(groups.map((group) => [group.id, group.name]));
}

const answersIn = (context: PreviewContext, groupId: string) =>
  countOf(
    context.db
      .selectFrom('probe_answer_items')
      .select(ROW_COUNT)
      .where('workspace_id', '=', context.workspaceId)
      .where('project_id', '=', context.projectId)
      .where('objection_group_id', '=', groupId)
      .executeTakeFirst(),
  );

const fingerprinted = z.strictObject({ fingerprint: z.string().min(1) });
const cadence = z.enum(['daily', 'weekly']);

export const probeKinds = {
  run_probe: changeKind({
    permission: MEMBER_RUN,
    purpose: 'run a market probe once in every market; spends AI credits when confirmed',
    payload: fingerprinted,
    draft: {
      schema: z.strictObject({}),
      complete: async (context) => ({ fingerprint: (await plan(context)).fingerprint }),
    },
    async execute(trx, config, actor, change, payload) {
      const ids = await runProbe(
        trx,
        { workspaceId: actor.workspaceId, projectId: change.projectId },
        payload,
        auditRuntime(config.settings),
      );
      return { summary: `Started the market probe in ${plural(ids.length, 'market')}.` };
    },
    async preview(context) {
      const quote = await plan(context);
      return {
        title: 'Run a market probe',
        rows: [
          { label: 'Markets', value: String(quote.runs.length) },
          { label: 'Engines', value: quote.engines.join(', ') },
          { label: 'Answers', value: String(quote.answers) },
        ],
        spend: `${plural(quote.credits, 'AI credit')}`,
        opens: PERCEPTION,
      };
    },
  }),
  set_probe_schedule: changeKind({
    permission: MEMBER_WRITE,
    purpose: 'run the market probe daily or weekly, or stop it (cadence null)',
    payload: z.union([z.strictObject({ cadence: z.null() }), fingerprinted.extend({ cadence })]),
    draft: {
      schema: z.strictObject({ cadence: cadence.nullable() }),
      async complete(context, draft) {
        if (draft.cadence === null) return { cadence: null };
        return { cadence: draft.cadence, fingerprint: (await plan(context)).fingerprint };
      },
    },
    async execute(trx, config, actor, change, payload) {
      await setProbeSchedule(
        trx,
        { workspaceId: actor.workspaceId, projectId: change.projectId },
        payload,
        auditRuntime(config.settings),
      );
      return {
        summary: payload.cadence
          ? `The market probe now runs ${payload.cadence}.`
          : 'The market probe no longer runs on a schedule.',
      };
    },
    async preview(context, payload) {
      if (payload.cadence === null)
        return {
          title: 'Stop the scheduled market probe',
          rows: [],
          spend: null,
          opens: PERCEPTION,
        };
      const quote = await plan(context);
      return {
        title: `Run the market probe ${payload.cadence}`,
        rows: [
          { label: 'Markets', value: String(quote.runs.length) },
          { label: 'Answers each run', value: String(quote.answers) },
        ],
        spend: `${plural(quote.credits, 'AI credit')} each run`,
        opens: PERCEPTION,
      };
    },
  }),
  rename_objection_group: changeKind({
    permission: MEMBER_WRITE,
    purpose: 'rename a probe objection group',
    payload: z.strictObject({ group_id: z.uuid(), ...groupRequest.shape }),
    async execute(trx, _config, actor, change, { group_id: groupId, ...input }) {
      const group = await renameGroup(
        trx,
        { workspaceId: actor.workspaceId, projectId: change.projectId, groupId },
        input,
      );
      return { summary: `Renamed the objection group to "${group.name}".` };
    },
    async preview(context, payload) {
      return {
        title: 'Rename an objection group',
        rows: [
          { label: 'Now', value: (await groupNames(context)).get(payload.group_id) ?? '' },
          { label: 'After', value: payload.name },
        ],
        spend: null,
        opens: PERCEPTION,
      };
    },
  }),
  merge_objection_groups: changeKind({
    permission: MEMBER_WRITE,
    purpose: 'merge one objection group into another; its answers move and it is deleted',
    payload: z.strictObject({ group_id: z.uuid(), into_id: z.uuid() }),
    async execute(trx, _config, actor, change, payload) {
      const kept = await mergeGroups(trx, {
        workspaceId: actor.workspaceId,
        projectId: change.projectId,
        groupId: payload.group_id,
        intoId: payload.into_id,
      });
      return { summary: `Merged into "${kept.name}".` };
    },
    async preview(context, payload) {
      const names = await groupNames(context);
      return {
        title: 'Merge objection groups',
        rows: [
          { label: 'Merge', value: names.get(payload.group_id) ?? '' },
          { label: 'Into', value: names.get(payload.into_id) ?? '' },
          { label: 'Answers moved', value: String(await answersIn(context, payload.group_id)) },
          PERMANENT,
        ],
        spend: null,
        opens: PERCEPTION,
      };
    },
  }),
  delete_objection_group: changeKind({
    permission: MEMBER_WRITE,
    purpose: 'delete an objection group with the probe answers filed under it',
    payload: z.strictObject({ group_id: z.uuid() }),
    async execute(trx, _config, actor, change, payload) {
      await deleteGroup(trx, {
        workspaceId: actor.workspaceId,
        projectId: change.projectId,
        groupId: payload.group_id,
      });
      return { summary: 'Deleted the objection group.' };
    },
    async preview(context, payload) {
      return {
        title: 'Delete an objection group',
        rows: [
          { label: 'Group', value: (await groupNames(context)).get(payload.group_id) ?? '' },
          {
            label: 'Answers deleted',
            value: String(await answersIn(context, payload.group_id)),
          },
          PERMANENT,
        ],
        spend: null,
        opens: PERCEPTION,
      };
    },
  }),
};
