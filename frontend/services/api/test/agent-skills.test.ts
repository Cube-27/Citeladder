import { mkdtemp, cp, appendFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentSkillSchema } from '@citeladder/contracts/agent';
import { agentSettings } from '../src/agent/config.ts';
import { loadSkillCatalog } from '../src/agent/skills.ts';
import { parseContentFormats } from '../src/config/skill-inputs.ts';

describe('packaged Agent model inputs', () => {
  const root = agentSettings({}).skillsDirectory;
  it('keeps example headings inside fenced methodology text and continues at the next format', () => {
    const { formats } = parseContentFormats(
      '# Formats\n## page — Page\nBody\n~~~markdown\n## example — Example\nLiteral example.\n~~~\n## briefing — Briefing\nBrief.',
    );
    expect([...formats.keys()]).toEqual(['page', 'briefing']);
    expect(formats.get('page')?.body).toContain('## example — Example');
  });
  it.each(['  ## briefing — Briefing', '## briefing malformed'])(
    'rejects malformed format headings %s instead of hiding them in a prior format',
    (heading) => {
      expect(() =>
        parseContentFormats('# Formats\n\n## page — Page\nBody\n' + heading + '\nBody'),
      ).toThrow('Invalid content format');
    },
  );
  it('loads packaged metadata, expanded vocabulary and one selected format', async () => {
    const catalog = await loadSkillCatalog(root);
    const skills = [...catalog.skills.values()];
    for (const skill of skills) agentSkillSchema.parse({ ...skill, output_kind: skill.outputKind });
    expect(skills.map((skill) => skill.order)).toEqual(
      [...skills.map((skill) => skill.order)].sort((a, b) => a - b),
    );
    expect(catalog.skills.get('content_create')?.outlineFirst).toBe(true);
    expect([...catalog.formats.values()].every((format) => format.body.length > 0)).toBe(true);
    expect(skills.some((skill) => /\{\{[a-z_]+\}\}/u.test(skill.body))).toBe(false);
  });
  it('fingerprints every model input and rejects undeclared vocabulary and duplicate metadata', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'agent-catalog-'));
    try {
      await cp(root, temporary, { recursive: true });
      // The runtime image supplies this exact alias and has no checkout fallback.
      const first = await loadSkillCatalog(
        agentSettings({ AGENT_SKILLS_DIRECTORY: temporary }).skillsDirectory,
      );
      await appendFile(
        join(temporary, 'content_formats.md'),
        '\n## briefing — Briefing\nA bounded briefing.\n',
      );
      const changed = await loadSkillCatalog(temporary);
      expect(changed.formats.has('briefing')).toBe(true);
      expect(changed.version).not.toBe(first.version);
      await appendFile(join(temporary, 'operating_contract.md'), '\nNew operating constraint.\n');
      expect((await loadSkillCatalog(temporary)).version).not.toBe(first.version);
      const skillPath = join(temporary, 'skills/content_create/SKILL.md');
      await appendFile(skillPath, '\n{{unregistered_vocabulary}}\n');
      await expect(loadSkillCatalog(temporary)).rejects.toThrow('Unknown skill vocabulary');
      await writeFile(skillPath, '---\nid: content_create\nid: content_create\n---\nBody');
      await expect(loadSkillCatalog(temporary)).rejects.toThrow('Invalid skill metadata');
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
