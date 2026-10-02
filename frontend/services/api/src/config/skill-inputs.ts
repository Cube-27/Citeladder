/** Native packaged model input parsing and deployment directory resolution. */
import { fileURLToPath } from 'node:url';

export function resolveSkillsDirectory(configured: string): string {
  return (
    configured ||
    fileURLToPath(new URL('../../../../../backend/app/core/config/agent_skills/', import.meta.url))
  );
}

function formatSections(body: string): string[] {
  const sections = [''];
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (
      marker &&
      (!fence ||
        (marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && !marker[2]!.trim()))
    )
      fence = fence ? null : marker[1]!;
    if (!fence && !marker && /^ {0,3}##(?:[ \t]|$)/u.test(line)) sections.push('');
    sections[sections.length - 1] += line + '\n';
  }
  return sections;
}

export function parseContentFormats(body: string) {
  const [preamble = '', ...sections] = formatSections(body);
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
