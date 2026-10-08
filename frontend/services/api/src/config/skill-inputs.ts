/** Native packaged model input parsing and deployment directory resolution. */
import { fileURLToPath } from 'node:url';

export function resolveSkillsDirectory(configured: string): string {
  return configured || fileURLToPath(new URL('../../assets/agent-skills/', import.meta.url));
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

export type ContentFormat = { id: string; label: string; body: string; longForm: boolean };

export function parseContentFormats(body: string) {
  const [preamble = '', ...sections] = formatSections(body);
  const formats = new Map<string, ContentFormat>();
  for (const section of sections) {
    // `[long-form]` marks formats whose drafts start from an approved outline.
    const heading = /^## ([a-z_]+) — (.+?)( \[long-form\])?\n/u.exec(section);
    if (!heading || formats.has(heading[1]!)) throw new TypeError('Invalid content format');
    const text = section.slice(heading[0].length).trim();
    if (!text) throw new TypeError('Empty content format');
    formats.set(heading[1]!, {
      id: heading[1]!,
      label: heading[2]!.trim(),
      body: text,
      longForm: Boolean(heading[3]),
    });
  }
  return { formatPreamble: preamble.slice(preamble.indexOf('\n') + 1).trim(), formats };
}
