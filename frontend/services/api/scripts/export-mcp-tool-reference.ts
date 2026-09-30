/** Public documentation metadata comes from the live TypeScript catalogue. */
import { readFileSync, writeFileSync } from 'node:fs';
import { mcpPolicy } from '../src/mcp/config.ts';
import { tools } from '../src/mcp/tools.ts';

const path = new URL('../../../apps/marketing/src/data/mcp-tools.json', import.meta.url);
const contents = `${JSON.stringify({
  server_version: mcpPolicy.server_version,
  access: 'read_only',
  tools: [...tools].sort((a, b) => a.name.localeCompare(b.name)).map(tool => ({ name: tool.name, title: tool.title, description: tool.description, input_schema: tool.inputSchema, read_only: tool.annotations.readOnlyHint })),
}, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(path,'utf8') !== contents) throw new Error('MCP tool reference is stale; run pnpm --filter @citeladder/api mcp:reference');
} else writeFileSync(path,contents);
