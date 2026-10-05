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
  const refs = Array.isArray(data.artifact_refs) ? data.artifact_refs : [];
  return {
    state:
      availability.parse(data.state ?? defaultState) === 'unavailable'
        ? ('unavailable' as const)
        : ('available' as const),
    data,
    artifactRefs: refs.flatMap((ref) => {
      const parsed = reference.safeParse(ref);
      if (!parsed.success) return [];
      const { record_uri, ...rest } = parsed.data;
      return [{ ...rest, ...(record_uri ? { record_uri } : {}) }];
    }),
    omissions: Array.isArray(data.omissions) ? data.omissions : [],
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
          const data = await dispatchTool(
            db,
            {
              kind: 'member',
              userId: scope.userId,
              workspaceId: scope.workspaceId,
              projectId: scope.projectId,
            },
            name,
            { ...args, ...(_project ? { project_id: scope.projectId } : {}) },
            '',
            maxChars,
          );
          const result = outcome(
            data,
            // Successful search, exact fetch and aggregate context have no
            // top-level availability field in their MCP contracts.
            ['search', 'fetch', 'get_project_business_context'].includes(name)
              ? 'available'
              : undefined,
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
