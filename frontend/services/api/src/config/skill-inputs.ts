/** Packaged model input parsing shared by the Agent and Opportunity handoff. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveSkillsDirectory(configured: string): string {
  return (
    configured ||
    fileURLToPath(new URL('../../../../../backend/app/core/config/agent_skills/', import.meta.url))
  );
}

export function parseContentFormats(body: string) {
  const [preamble = '', ...sections] = body.split(/\n(?=## )/u);
  const formats = new Map<string, { id: string; label: string; body: string }>();
  for (const section of sections) {
    const heading = /^## ([a-z_]+) — (.+)\n/u.exec(section);
    if (!heading || formats.has(heading[1]!)) throw new TypeError('Invalid content format');
    const text = section.slice(heading[0].length).trim();
    if (!text) throw new TypeError('Empty content format');
    formats.set(heading[1]!, { id: heading[1]!, label: heading[2]!.trim(), body: text });
  }
  return { formatPreamble: preamble.slice(preamble.indexOf('\n') + 1).trim(), formats };
}

export function contentFormatIds(configured: string): string[] {
  const body = readFileSync(
    join(resolveSkillsDirectory(configured), 'content_formats.md'),
    'utf8',
  ).replaceAll('\r\n', '\n');
  const { formats } = parseContentFormats(body);
  if (!formats.size) throw new TypeError('Incomplete content format catalog');
  return [...formats.keys()];
}
