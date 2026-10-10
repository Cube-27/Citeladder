/** Public documentation metadata comes from the live TypeScript catalogue. */
import { readFileSync, writeFileSync } from 'node:fs';
import { mcpPolicy } from '../src/mcp/config.ts';
import { tools } from '../src/mcp/tools.ts';
import { writeTools } from '../src/mcp/write-tools.ts';

const path = new URL('../../../apps/docs/src/data/mcp-tools.json', import.meta.url);
const entry = (tool: (typeof tools)[number] | (typeof writeTools)[number]) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  input_schema: tool.inputSchema,
  access: tool.annotations.readOnlyHint ? 'read' : 'write',
});
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
// Reads first, then changes, which only a connection with Allow changes lists.
const contents = `${JSON.stringify(
  {
    server_version: mcpPolicy.server_version,
    tools: [...[...tools].sort(byName), ...[...writeTools].sort(byName)].map(entry),
  },
  null,
  2,
)}
`;
if (process.argv.includes('--check')) {
  if (
    JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))) !== JSON.stringify(JSON.parse(contents))
  )
    throw new Error('MCP tool reference is stale; run pnpm --filter @citeladder/api mcp:reference');
} else writeFileSync(path, contents);
