import type { LegalDocument } from './legal';

type LegalSection = LegalDocument['sections'][number];

const HEADING = /^## ([a-z0-9-]+) \| (\S.*)$/;

/**
 * Reads long policy prose written as plain text rather than one object per
 * section. `## id | Title` starts a section, `- ` starts a bullet and every
 * other non-blank line is one paragraph.
 */
export function legalSections(text: string): LegalSection[] {
  const sections: { id: string; title: string; paragraphs: string[]; bullets: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) {
      const heading = HEADING.exec(line);
      if (!heading) throw new Error(`Malformed legal section heading: ${line}`);
      sections.push({ id: heading[1], title: heading[2], paragraphs: [], bullets: [] });
      continue;
    }
    const section = sections.at(-1);
    if (!section) throw new Error(`Legal text before the first section: ${line}`);
    if (line.startsWith('- ')) section.bullets.push(line.slice(2));
    else section.paragraphs.push(line);
  }
  return sections.map(({ paragraphs, bullets, ...section }) => ({
    ...section,
    ...(paragraphs.length ? { paragraphs } : {}),
    ...(bullets.length ? { bullets } : {}),
  }));
}
