import { mkdtemp, cp, appendFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentSkillSchema } from '@citeladder/contracts/agent';
import { agentSettings } from '../src/agent/config.ts';
import { loadSkillCatalog } from '../src/agent/skills.ts';

describe('packaged Agent model inputs', () => {
  const root = agentSettings({}).skillsDirectory;
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
      const first = await loadSkillCatalog(temporary);
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
