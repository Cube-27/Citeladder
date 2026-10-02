/** Packaged model input; files stay under their existing config owner. */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import { policy } from '../config.ts';
import { parseContentFormats } from '../config/skill-inputs.ts';
import { compareText } from '../text-order.ts';
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
  const files = await Promise.all(
    (await readdir(root, { withFileTypes: true })).map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    }),
  );
  return files.flat().sort(compareText);
}
function parseSkill(path: string, body: string): CatalogSkill {
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
  if (path !== `skills/${parsed.id}/SKILL.md`) throw new TypeError('Skill directory must match id');
  const methodology = match[2]!.trim();
  if (!methodology || methodology.length > p.body_max_chars)
    throw new TypeError('Invalid skill body');
  return {
    ...parsed,
    outputKind: parsed.output_kind,
    body: methodology,
    outlineFirst: p.outline_first_kinds.includes(parsed.output_kind),
  };
}
export async function loadSkillCatalog(root: string): Promise<PackagedCatalog> {
  const digest = createHash('sha256');
  const skills: CatalogSkill[] = [];
  let operatingContract = '';
  let formatPreamble = '';
  let formats: PackagedCatalog['formats'] = new Map();
  const inputs = await Promise.all(
    (await markdownFiles(root)).map(async (file) => ({
      path: relative(root, file).split(sep).join('/'),
      body: expand((await readFile(file, 'utf8')).replaceAll('\r\n', '\n')),
    })),
  );
  for (const { path, body } of inputs) {
    digest.update(path).update('\0').update(body).update('\0');
    if (path === 'operating_contract.md') operatingContract = body;
    else if (path === 'content_formats.md') {
      ({ formatPreamble, formats } = parseContentFormats(body));
    } else if (/^skills\/[^/]+\/SKILL\.md$/u.test(path)) {
      skills.push(parseSkill(path, body));
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
    skills: new Map(skills.toSorted((a, b) => a.order - b.order).map((skill) => [skill.id, skill])),
    formatPreamble,
    formats,
  };
}
