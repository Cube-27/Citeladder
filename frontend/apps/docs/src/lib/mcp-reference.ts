import { z } from 'zod';
import catalog from '../data/mcp-tools.json';
import { jsonSchema, referenceRow } from './json-schema';

const toolCatalog = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      description: z.string(),
      access: z.enum(['read', 'write']),
      input_schema: jsonSchema,
    }),
  ),
});

export const MCP_TOOLS = toolCatalog.parse(catalog).tools.map((tool) => {
  const required = new Set(tool.input_schema.required ?? []);
  return {
    id: `tool-${tool.name.replaceAll('_', '-')}`,
    name: tool.name,
    title: tool.title,
    description: tool.description,
    access: tool.access,
    input: Object.entries(tool.input_schema.properties ?? {}).map(([name, schema]) =>
      referenceRow(name, schema, required.has(name)),
    ),
  };
});

export type McpTool = (typeof MCP_TOOLS)[number];
