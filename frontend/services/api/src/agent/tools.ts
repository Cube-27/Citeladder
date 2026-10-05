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
  /** Citation grants cover only evidence actually supplied to the model. */
  citationRefs?: ToolResult['artifactRefs'];
  omissions: Json[];
  hash: string;
  error: string;
};
export type ReadTool = {
  name: string;
  description: string;
  arguments: z.ZodType<Record<string, Json>>;
  read: (
    scope: Scope,
    args: Record<string, Json>,
    signal: AbortSignal,
    maxChars: number,
  ) => Promise<ToolResult>;
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
    maxChars = agentPolicy.tool_result_max_chars,
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
      const result = await abortable(() => tool.read(scope, parsed.data, signal, maxChars), signal);
      const serialized = JSON.stringify(result.data);
      const bounded = boundToolData(result.data, maxChars);
      return {
        status: result.state === 'unavailable' ? 'unavailable' : 'completed',
        text: bounded.text,
        refs: result.artifactRefs,
        citationRefs: serialized.length <= maxChars ? result.artifactRefs : [],
        omissions: [...result.omissions, ...bounded.omissions],
        hash: createHash('sha256').update(serialized).digest('hex'),
        error: '',
      };
    } catch {
      return { ...refused('tool_failed'), status: 'failed' };
    }
  }
}
export function boundToolData(data: Json, maxChars: number) {
  const full = JSON.stringify(data);
  if (full.length <= maxChars) return { text: full, supplied: true, omissions: [] };
  const selected: Record<string, Json> = {};
  const fields = data && typeof data === 'object' && !Array.isArray(data) ? data : { value: data };
  const omitted = Object.keys(fields);
  const envelope = () =>
    JSON.stringify({ data: selected, complete: false, omitted_sections: omitted });
  for (const [key, value] of Object.entries(fields)) {
    selected[key] = value;
    const index = omitted.indexOf(key);
    omitted.splice(index, 1);
    if (envelope().length > maxChars) {
      delete selected[key];
      omitted.splice(index, 0, key);
    }
  }
  const text = envelope();
  return {
    text:
      text.length <= maxChars
        ? text
        : JSON.stringify({ complete: false, reason: 'tool_result_size_limit' }),
    supplied: Object.keys(selected).length > 0 && text.length <= maxChars,
    omissions: [{ reason: 'tool_result_truncated', count: 1, sections: omitted }],
  };
}
export function refused(error: string): ToolOutcome {
  return { status: 'refused', text: error, refs: [], omissions: [], hash: '', error };
}
