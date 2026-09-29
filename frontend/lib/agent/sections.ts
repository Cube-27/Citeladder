/**
 * A Markdown output as the sections a reader works on: each starts at a
 * level 1–3 heading and runs to the next one; text before the first heading
 * is an untitled introduction. Headings inside fenced code are content, not
 * section breaks. Joining the sections back reproduces the body exactly.
 */

export type OutputSection = { heading: string | null; text: string };

const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

export function splitSections(body: string): OutputSection[] {
  const sections: OutputSection[] = [];
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] };
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0]!;
      else if (marker[0] === fence) fence = null;
    }
    const heading = fence === null && !marker ? HEADING.exec(line) : null;
    if (heading) {
      const blankIntro = current.heading === null && !current.lines.some((item) => item.trim());
      // Leading blank lines belong to the first titled section.
      const carried = blankIntro ? current.lines : [];
      if (!blankIntro) sections.push({ heading: current.heading, text: current.lines.join('\n') });
      current = { heading: heading[2]!, lines: [...carried, line] };
      continue;
    }
    current.lines.push(line);
  }
  sections.push({ heading: current.heading, text: current.lines.join('\n') });
  return sections;
}

/** The body with one section's text replaced and every other section kept. */
export function replaceSection(body: string, index: number, text: string): string {
  const sections = splitSections(body);
  if (index < 0 || index >= sections.length) return body;
  return sections
    .map((section, position) => {
      if (position !== index) return section.text;
      // Keep the blank lines that separated this section from the next.
      const trailing = /\n*$/.exec(section.text)?.[0] ?? '';
      return text.replace(/\n+$/, '') + trailing;
    })
    .join('\n');
}
