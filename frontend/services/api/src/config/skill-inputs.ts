/** Native packaged model input parsing and deployment directory resolution. */
import { fileURLToPath } from 'node:url';

export function resolveSkillsDirectory(configured: string): string {
  return (
    configured ||
    fileURLToPath(new URL('../../../../../backend/app/core/config/agent_skills/', import.meta.url))
  );
}

export function parseContentFormats(body: string) {
  for (const heading of body.matchAll(/^[ \t]*##(?!#).*$/gmu)) {
    if (!/^## ([a-z_]+) — (.+)$/u.test(heading[0])) throw new TypeError('Invalid content format');
  }
  const [preamble = '', ...sections] = (body.startsWith('## ') ? '\n' + body : body).split(
    /\n(?=## )/u,
  );
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
