/** The shared MCP catalogue runs under live membership on the chat's fixed project. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { definitions, dispatchTool } from '../mcp/tools.ts';
import { parseRecordId } from '../mcp/retrieval.ts';
import { getAction, listActions, requireAction } from '../opportunities/actions.ts';
import { listDifferentiationReports } from '../source-pages/differentiation-reads.ts';
import { ToolRegistry, type ReadTool } from './tools.ts';
import { type Json, type Scope } from './contracts.ts';

const reference = z.object({ id: z.string(), record_uri: z.string().nullish() }).catchall(z.json());
const availability = z.enum([
  'available',
  'unavailable',
  policy.demand.QUERY_EVIDENCE_STATE_OBSERVED_ZERO,
]);
function outcome(value: unknown, defaultState?: 'available') {
  const data = z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify(value)));
  const refs = z.array(reference).parse(data.artifact_refs ?? []);
  return {
    state:
      availability.parse(data.state ?? defaultState) === 'unavailable'
        ? ('unavailable' as const)
        : ('available' as const),
    data,
    artifactRefs: refs.map((ref) => {
      const { record_uri, ...rest } = ref;
      return { ...rest, ...(record_uri ? { record_uri } : {}) };
    }),
    omissions: z.array(z.json()).parse(data.omissions ?? []),
  };
}
function sharedTools(db: Database): ReadTool[] {
  return Object.entries(definitions)
    .filter(([name]) => name !== 'list_projects')
    .map(([name, definition]) => {
      const { project_id: _project, ...fields } = definition.schema.shape as Record<
        string,
        z.ZodType
      >;
      return {
        name,
        description: definition.description,
        arguments: z.strictObject(fields) as z.ZodType<Record<string, Json>>,
        read: async (scope: Scope, args: Record<string, Json>, _signal, maxChars) => {
          const input: Record<string, Json> = {
            ...args,
            ...(_project ? { project_id: scope.projectId } : {}),
          };
          const dispatch = () =>
            dispatchTool(
              db,
              {
                kind: 'member',
                userId: scope.userId,
                workspaceId: scope.workspaceId,
                projectId: scope.projectId,
              },
              name,
              input,
              '',
              maxChars,
            );
          let data = await dispatch();
          // Let the existing owner construct a smaller page and its exact
          // continuation cursor. Never discard rows behind a later cursor.
          if (Object.hasOwn(fields, 'limit') && Array.isArray(data.items)) {
            let limit = data.items.length;
            while (JSON.stringify(data).length > maxChars && limit > 1) {
              limit = Math.max(1, Math.floor(limit / 2));
              input.limit = limit;
              data = await dispatch();
            }
          }
          const result = outcome(
            data,
            definition.availability === 'successful_read' ? 'available' : undefined,
          );
          if (name === 'fetch' && typeof data.id === 'string') {
            result.artifactRefs.push({ id: parseRecordId(data.id).id, record_uri: data.id });
          }
          return result;
        },
      };
    });
}
function actionTools(db: Database): ReadTool[] {
  return [
    {
      name: 'list_actions',
      description: 'Read current Actions, priorities and deterministic diagnoses.',
      arguments: z.strictObject({
        cursor: z.string().nullish(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(policy.opportunity.actions.ACTION_LIST_MAX_LIMIT)
          .nullish(),
      }),
      read: async (scope, args) => {
        const page = await listActions(db, scope, {
          status: null,
          target_kind: null,
          cursor: typeof args.cursor === 'string' ? args.cursor : null,
          limit: Number(args.limit ?? policy.opportunity.actions.ACTION_LIST_DEFAULT_LIMIT),
        });
        return outcome({ state: 'available', ...page });
      },
    },
    {
      name: 'get_action',
      description: 'Read one Action and its persisted member Opportunity evidence.',
      arguments: z.strictObject({ action_id: z.uuid() }),
      read: async (scope, args) => {
        const row = await requireAction(db, scope.workspaceId, String(args.action_id));
        if (row.project_id !== scope.projectId)
          throw new Error('Action belongs to another project');
        return outcome({
          state: 'available',
          action: await getAction(db, scope.workspaceId, row.id),
        });
      },
    },
    {
      name: 'list_content_differentiation',
      description: 'Read descriptive comparisons over persisted, inspected page evidence.',
      arguments: z.strictObject({}),
      read: async (scope) =>
        outcome({
          state: 'available',
          items: await listDifferentiationReports(
            db,
            scope,
            policy.agent.differentiation_report_limit,
          ),
        }),
    },
  ];
}
export function agentTools(db: Database) {
  const entries = [...sharedTools(db), ...actionTools(db)];
  const catalog = entries.map(({ name, description, arguments: schema }) => ({
    name,
    description,
    schema: z.toJSONSchema(schema, { io: 'input' }),
  }));
  const version = `agent-tools-${createHash('sha256').update(JSON.stringify(catalog)).digest('hex').slice(0, 16)}`;
  return new ToolRegistry(version, entries);
}
