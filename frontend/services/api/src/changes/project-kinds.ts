import { z } from 'zod';
import {
  actionDeclarationRequestSchema,
  actionUserStatusSchema,
} from '@citeladder/contracts/actions';
import { suggestionRows } from '../analysis/observed-competitors.ts';
import { ACTIONS_WRITE, declareAction, setActionStatus } from '../commands/actions.ts';
import {
  acceptSuggestion,
  addCompetitor,
  COMPETITORS_WRITE,
  rejectSuggestion,
} from '../commands/competitors.ts';
import { competitorCreate } from '../projects/competitors.ts';
import { changeKind, rowsOf, type PreviewContext } from './kind.ts';

async function actionLabel(context: PreviewContext, actionId: string) {
  const action = await context.db
    .selectFrom('actions')
    .select('target_label')
    .where('workspace_id', '=', context.workspaceId)
    .where('project_id', '=', context.projectId)
    .where('id', '=', actionId)
    .executeTakeFirst();
  return action?.target_label || 'the Action';
}

const STATUS_VERBS = {
  in_progress: 'Accept',
  dismissed: 'Decline',
  open: 'Restore',
} as const satisfies Record<z.infer<typeof actionUserStatusSchema>, string>;

const declarationKey = (changeId: string) => `mcp:${changeId}`;

export const projectKinds = {
  add_competitor: changeKind({
    permission: COMPETITORS_WRITE,
    purpose: 'track one more competitor',
    payload: competitorCreate,
    async execute(trx, _config, actor, change, payload) {
      const competitor = await addCompetitor(trx, actor, change.projectId, payload);
      return { summary: `Now tracking ${competitor.name}.`, competitor: { id: competitor.id } };
    },
    preview(_context, payload) {
      return Promise.resolve({
        title: `Track “${payload.name}” as a competitor`,
        rows: [...rowsOf('Also called', payload.aliases), ...rowsOf('Domain', payload.domains)],
        spend: null,
        opens: null,
      });
    },
  }),
  review_competitor_suggestion: changeKind({
    permission: COMPETITORS_WRITE,
    purpose: 'accept (track it) or reject (hide it) one competitor suggestion',
    payload: z.strictObject({ suggestion_id: z.uuid(), decision: z.enum(['accept', 'reject']) }),
    async execute(trx, _config, actor, change, payload) {
      if (payload.decision === 'reject') {
        const rejected = await rejectSuggestion(
          trx,
          actor,
          change.projectId,
          payload.suggestion_id,
        );
        return { summary: `Rejected the suggestion ${rejected.name}.` };
      }
      const competitor = await acceptSuggestion(
        trx,
        actor,
        change.projectId,
        payload.suggestion_id,
      );
      return { summary: `Now tracking ${competitor.name}.`, competitor: { id: competitor.id } };
    },
    async preview(context, payload) {
      const suggestion = await suggestionRows(context.db, context)
        .select(['name', 'domain'])
        .where('id', '=', payload.suggestion_id)
        .executeTakeFirst();
      const name = suggestion?.domain ?? suggestion?.name ?? 'the suggestion';
      return {
        title:
          payload.decision === 'accept'
            ? `Track the suggested competitor “${name}”`
            : `Hide the competitor suggestion “${name}”`,
        rows: [],
        spend: null,
        opens: null,
      };
    },
  }),
  update_action_status: changeKind({
    permission: ACTIONS_WRITE,
    purpose:
      'accept an Action (in_progress), decline it (dismissed) or restore a declined one (open)',
    payload: z.strictObject({ action_id: z.uuid(), status: actionUserStatusSchema }),
    async execute(trx, _config, actor, change, payload) {
      await setActionStatus(trx, actor, change.projectId, payload.action_id, payload.status);
      return { summary: `The Action is now ${payload.status}.` };
    },
    async preview(context, payload) {
      return {
        title: `${STATUS_VERBS[payload.status]} the Action “${await actionLabel(context, payload.action_id)}”`,
        rows: [],
        spend: null,
        opens: null,
      };
    },
  }),
  declare_implemented: changeKind({
    permission: ACTIONS_WRITE,
    purpose: 'declare that the work of an open Action is done',
    payload: z.strictObject({
      action_id: z.uuid(),
      declaration: actionDeclarationRequestSchema,
    }),
    async execute(trx, _config, actor, change, payload) {
      const { declaration } = await declareAction(
        trx,
        actor,
        change.projectId,
        payload.action_id,
        payload.declaration,
        { idempotencyKey: declarationKey(change.id) },
      );
      return {
        summary: 'Action declared implemented. CiteLadder checks later evidence against it.',
        declaration: { id: declaration.id },
      };
    },
    async preview(context, payload) {
      return {
        title: `Mark the Action “${await actionLabel(context, payload.action_id)}” implemented`,
        rows: [
          {
            label: 'Live since',
            value: payload.declaration.declared_implemented_at.slice(0, 10),
          },
        ],
        spend: null,
        opens: null,
      };
    },
  }),
};
