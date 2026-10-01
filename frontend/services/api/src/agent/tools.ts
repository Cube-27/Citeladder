import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { authorize } from './access.ts';
import { abortable } from './async.ts';
import { agentPolicy, type Scope, type Json } from './contracts.ts';

type ToolResult = {
  state: 'available' | 'unavailable';
  data: Json;
  artifactRefs: { id: string; record_uri?: string; [key: string]: Json | undefined }[];
  omissions: Json[];
};
export type ToolOutcome = {
  status: 'completed' | 'unavailable' | 'failed' | 'refused';
  text: string;
  refs: ToolResult['artifactRefs'];
  omissions: Json[];
  hash: string;
  error: string;
};
export type ReadTool = {
  name: string;
  description: string;
  arguments: z.ZodType<Record<string, Json>>;
  read: (scope: Scope, args: Record<string, Json>, signal: AbortSignal) => Promise<ToolResult>;
};

/** Server-pinned scope; registry entries are read adapters, never HTTP or SQL tools. */
export class ToolRegistry {
  readonly #tools: Map<string, ReadTool>;
  readonly version: string;
  constructor(version: string, tools: readonly ReadTool[]) {
    this.version = version;
    this.#tools = new Map(tools.map((tool) => [tool.name, tool]));
    if (this.#tools.size !== tools.length) throw new TypeError('Duplicate Agent tool');
  }
  catalog() {
    return [...this.#tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      arguments: z.toJSONSchema(tool.arguments),
    }));
  }
  has(name: string) {
    return this.#tools.has(name);
  }
  async execute(
    db: Database,
    scope: Scope,
    name: string,
    args: Record<string, Json>,
    signal: AbortSignal,
  ): Promise<ToolOutcome> {
    await authorize(db, scope);
    const tool = this.#tools.get(name);
    const parsed = tool?.arguments.safeParse(args);
    if (
      !tool ||
      !parsed?.success ||
      Object.hasOwn(args, 'project_id') ||
      Object.hasOwn(args, 'workspace_id')
    )
      return refused('unknown_tool_or_arguments');
    try {
      const result = await abortable(() => tool.read(scope, parsed.data, signal), signal);
      const serialized = JSON.stringify(result.data);
      const truncated = serialized.length > agentPolicy.tool_result_max_chars;
      return {
        status: result.state === 'unavailable' ? 'unavailable' : 'completed',
        text: truncated
          ? serialized.slice(0, agentPolicy.tool_result_max_chars) + '\n[tool result truncated]'
          : serialized,
        refs: result.artifactRefs,
        omissions: [
          ...result.omissions,
          ...(truncated ? [{ reason: 'tool_result_truncated', count: 1 }] : []),
        ],
        hash: createHash('sha256').update(serialized).digest('hex'),
        error: '',
      };
    } catch {
      return { ...refused('tool_failed'), status: 'failed' };
    }
  }
}
export function refused(error: string): ToolOutcome {
  return { status: 'refused', text: error, refs: [], omissions: [], hash: '', error };
}
