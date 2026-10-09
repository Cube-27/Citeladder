/** The shared MCP catalogue runs under live membership on the chat's fixed project. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { definitions, dispatchTool, presentationTools } from '../mcp/tools.ts';
import { parseRecordId } from '../mcp/retrieval.ts';
import { ToolRegistry, type ReadTool } from './tools.ts';
import { type Json, type Scope } from './contracts.ts';

const reference = z.object({ id: z.string(), record_uri: z.string().nullish() }).catchall(z.json());
const availability = z.enum([
  'available',
  'unavailable',
  policy.demand.QUERY_EVIDENCE_STATE_OBSERVED_ZERO,
]);
function outcome(value: unknown) {
  const data = z.record(z.string(), z.json()).parse(value);
  const refs = z.array(reference).parse(data.artifact_refs ?? []);
  const unavailable = availability.parse(data.state ?? 'available') === 'unavailable';
  // The reason an absent read gives is the omission the turn records.
  const reason = unavailable && typeof data.reason === 'string' ? [{ reason: data.reason }] : [];
  return {
    state: unavailable ? ('unavailable' as const) : ('available' as const),
    data,
    artifactRefs: refs.map((ref) => {
      const { record_uri, ...rest } = ref;
      return { ...rest, ...(record_uri ? { record_uri } : {}) };
    }),
    omissions: [...z.array(z.json()).parse(data.omissions ?? []), ...reason],
  };
}
// The chat's project is fixed, and MCP App views render nothing in a chat.
const NOT_FOR_AGENT = new Set(['list_projects', ...presentationTools]);
function sharedTools(db: Database): ReadTool[] {
  return Object.entries(definitions)
    .filter(([name]) => !NOT_FOR_AGENT.has(name))
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
          const result = outcome(data);
          if (name === 'fetch' && typeof data.id === 'string') {
            result.artifactRefs.push({ id: parseRecordId(data.id).id, record_uri: data.id });
          }
          return result;
        },
      };
    });
}
export function agentTools(db: Database) {
  const entries = sharedTools(db);
  const catalog = entries.map(({ name, description, arguments: schema }) => ({
    name,
    description,
    schema: z.toJSONSchema(schema, { io: 'input' }),
  }));
  const version = `agent-tools-${createHash('sha256').update(JSON.stringify(catalog)).digest('hex').slice(0, 16)}`;
  return new ToolRegistry(version, entries);
}
