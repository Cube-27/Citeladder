/** Packaged model input; files stay under their existing config owner. */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import { policy } from '../config.ts';
import type { Skill, SkillCatalog } from './contracts.ts';

const p = policy.agent_skills;
const metadata = z
  .object({
    id: z.string().regex(/^[a-z_]+$/u),
    label: z.string().trim().min(1),
    group: z.enum(p.groups),
    order: z.coerce.number().int().positive(),
    version: z.coerce.number().int().positive(),
    output_kind: z.enum(p.output_kinds),
    description: z.string().trim().min(1).max(p.description_max_chars),
  })
  .strict();
type CatalogSkill = Skill & z.infer<typeof metadata>;
export type PackagedCatalog = Omit<SkillCatalog, 'skills'> & {
  skills: ReadonlyMap<string, CatalogSkill>;
  formatPreamble: string;
  formats: ReadonlyMap<string, { id: string; label: string; body: string }>;
};
function expand(body: string) {
  return body.replace(/\{\{([a-z_]+)\}\}/gu, (_match, name: string) => {
    const values = p.vocabularies[name as keyof typeof p.vocabularies];
    if (!values) throw new TypeError(`Unknown skill vocabulary: ${name}`);
    return values.join(', ');
  });
}
async function markdownFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files.sort();
}
export async function loadSkillCatalog(root: string): Promise<PackagedCatalog> {
  const digest = createHash('sha256');
  const skills: CatalogSkill[] = [];
  let operatingContract = '';
  let formatPreamble = '';
  const formats = new Map<string, { id: string; label: string; body: string }>();
  for (const file of await markdownFiles(root)) {
    const path = relative(root, file).split(sep).join('/');
    const body = expand((await readFile(file, 'utf8')).replaceAll('\r\n', '\n'));
    digest.update(path).update('\0').update(body).update('\0');
    if (path === 'operating_contract.md') operatingContract = body;
    else if (path === 'content_formats.md') {
      const [preamble = '', ...sections] = body.split(/\n(?=## )/u);
      formatPreamble = preamble.slice(preamble.indexOf('\n') + 1).trim();
      for (const section of sections) {
        const heading = /^## ([a-z_]+) — (.+)\n/u.exec(section);
        if (!heading || formats.has(heading[1]!)) throw new TypeError('Invalid content format');
        formats.set(heading[1]!, {
          id: heading[1]!,
          label: heading[2]!.trim(),
          body: section.slice(heading[0].length).trim(),
        });
      }
    } else if (/^skills\/[^/]+\/SKILL\.md$/u.test(path)) {
      const match = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/u.exec(body);
      if (!match) throw new TypeError(`Missing skill frontmatter: ${path}`);
      const values: Record<string, string> = {};
      for (const line of match[1]!.split('\n')) {
        const field = /^([a-z_]+): (.+)$/u.exec(line);
        if (!field || Object.hasOwn(values, field[1]!))
          throw new TypeError(`Invalid skill metadata: ${path}`);
        values[field[1]!] = field[2]!;
      }
      const parsed = metadata.parse(values);
      if (path !== `skills/${parsed.id}/SKILL.md`)
        throw new TypeError('Skill directory must match id');
      const methodology = match[2]!.trim();
      if (!methodology || methodology.length > p.body_max_chars)
        throw new TypeError('Invalid skill body');
      skills.push({
        ...parsed,
        outputKind: parsed.output_kind,
        body: methodology,
        outlineFirst: p.outline_first_kinds.includes(parsed.output_kind),
      });
    }
  }
  if (!skills.length || !operatingContract.trim() || !formats.size)
    throw new TypeError('Incomplete skill catalog');
  if (
    new Set(skills.map((skill) => skill.id)).size !== skills.length ||
    new Set(skills.map((skill) => skill.order)).size !== skills.length
  )
    throw new TypeError('Duplicate skill id/order');
  return {
    version: `agent-skills-${digest.digest('hex').slice(0, 16)}`,
    operatingContract,
    skills: new Map(skills.sort((a, b) => a.order - b.order).map((skill) => [skill.id, skill])),
    formatPreamble,
    formats,
  };
}
