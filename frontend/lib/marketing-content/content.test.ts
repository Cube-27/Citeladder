// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { headingId } from '@/components/marketing/content/heading-id';

import { POSTS, type BlogBlock } from './blog';
import { COMPETITORS } from './compare';
import { FAQ_GROUPS } from './faq';
import { FOOTER_LEGAL_LINKS, LEGAL_DOCUMENTS } from './legal-documents';
import { FOOTER_COLUMNS, NAV_DROPS, NAV_LINKS, PUBLISHED_PLATFORM, type NavDropItem } from './nav';
import { PLATFORM_PAGES } from './platform-pages';
import { FOUNDER, PRODUCT_HEAD } from './people';
import { PLAN_PRESENTATION, capabilityLabel } from './pricing';
import { CITELADDER_LINKEDIN } from './social';
import { SOLUTION_SEGMENTS } from './solutions';

const ALL_LEGAL = LEGAL_DOCUMENTS;

function richParagraphText(block: Extract<BlogBlock, { type: 'richParagraph' }>): string {
  return block.content
    .map((part) => {
      if (typeof part === 'string') return part;
      return part.type === 'link' ? `${part.text} ${part.href}` : part.sourceId;
    })
    .join(' ');
}

function internalHrefs(): string[] {
  const fromDrops = NAV_DROPS.flatMap((drop) => [
    drop.href,
    ...drop.groups.flatMap((group) =>
      group.items
        .filter((item: NavDropItem) => !('external' in item && item.external))
        .map((item) => item.href),
    ),
  ]);
  return [
    ...fromDrops,
    ...NAV_LINKS.map((link) => link.href),
    ...FOOTER_LEGAL_LINKS.map((link) => link.href),
  ];
}

function blockText(block: BlogBlock): string {
  if ('text' in block) {
    return block.type === 'callout' ? `${block.title ?? ''} ${block.text}` : block.text;
  }
  switch (block.type) {
    case 'list':
      return block.items.join(' ');
    case 'table':
      return [...block.headers, ...block.rows.flat()].join(' ');
    case 'checklist':
      return block.items.map((item) => `${item.title} ${item.description}`).join(' ');
    case 'diagram':
      return `${block.title ?? ''} ${JSON.stringify(block.data)}`;
    case 'richParagraph':
      return richParagraphText(block);
  }
}

function marketingRouteExists(href: string): boolean {
  if (PUBLISHED_PLATFORM.some((item) => item.href === href)) {
    return PLATFORM_PAGES.some((page) => page.path === href);
  }
  const path = href.split('#', 1)[0]!;
  if (ALL_LEGAL.some((document) => document.path === path)) return true;
  if (researchSlugs().includes(path)) return true;
  const pathname = path.replace(/^\//, '');
  const pages = resolve(import.meta.dirname, '../../apps/marketing/src/pages');
  const candidates = pathname
    ? [resolve(pages, `${pathname}.astro`), resolve(pages, pathname, 'index.astro')]
    : [resolve(pages, 'index.astro')];
  return candidates.some((candidate) => existsSync(candidate));
}

function researchSlugs(): string[] {
  return readdirSync(RESEARCH_DIR).flatMap((file) => {
    const slug = /^slug: '([^']+)'$/m.exec(readFileSync(resolve(RESEARCH_DIR, file), 'utf8'));
    return slug?.[1] ? [slug[1]] : [];
  });
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

describe('marketing navigation', () => {
  it('routes every internal link from the site root', () => {
    for (const href of internalHrefs()) {
      expect(href, href).toMatch(/^\/(?:$|[a-z0-9#/-])/);
      expect(marketingRouteExists(href), href).toBe(true);
    }
  });

  it('gives every dropdown a unique key and a non-empty label', () => {
    const keys = NAV_DROPS.map((drop) => drop.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const drop of NAV_DROPS) {
      expect(drop.label.trim(), drop.key).not.toBe('');
      expect(drop.groups.length, drop.key).toBeGreaterThan(0);
    }
  });

  it('gives every dropdown row a title, a description, and a destination', () => {
    for (const drop of NAV_DROPS) {
      for (const group of drop.groups) {
        expect(group.items.length, drop.key).toBeGreaterThan(0);
        for (const item of group.items) {
          expect(item.title.trim(), `${drop.key}/${item.href}`).not.toBe('');
          expect(item.desc.trim(), `${drop.key}/${item.title}`).not.toBe('');
          expect(item.href.trim(), `${drop.key}/${item.title}`).not.toBe('');
        }
      }
    }
  });

  it('links every study section from the footer and the research index from Resources', () => {
    const footerResearch = FOOTER_COLUMNS.find((column) => column.key === 'research')!.links.map(
      (link) => link.href,
    );
    expect(footerResearch.slice(0, 4)).toEqual([
      '/ai-crawlers',
      '/buyer-prompts',
      '/claude-recommendations',
      '/research',
    ]);
    const resources = NAV_DROPS.find((drop) => drop.key === 'resources')!;
    const research = resources.groups
      .flatMap((group) => group.items)
      .find((item) => item.href === '/research');
    expect(research?.desc).toBe('Research on AI Crawlers and AI Answers');
  });
});

describe('pricing content', () => {
  it('blurbs every plan key', () => {
    for (const [key, plan] of Object.entries(PLAN_PRESENTATION)) {
      expect(plan.blurb.trim(), key).not.toBe('');
    }
  });

  it('highlights exactly one plan', () => {
    const highlighted = Object.values(PLAN_PRESENTATION).filter((plan) => plan.highlighted);
    expect(highlighted).toHaveLength(1);
  });

  it('humanises an unmapped capability key instead of rendering nothing', () => {
    expect(capabilityLabel('a_brand_new_capability')).toBe('A brand new capability');
    expect(capabilityLabel('')).toBe('');
  });
});

describe('blog content', () => {
  it('gives every published post a PNG share image at the declared dimensions', () => {
    for (const post of POSTS) {
      expect(post.image, post.slug).toMatch(/^\/.+\.png$/);
      const image = readFileSync(resolve(process.cwd(), 'public', String(post.image).slice(1)));
      expect(image.subarray(0, 8).toString('hex'), post.slug).toBe('89504e470d0a1a0a');
      expect(image.readUInt32BE(16), post.slug).toBe(1080);
      expect(image.readUInt32BE(20), post.slug).toBe(630);
    }
  });

  it('has unique slugs', () => {
    const slugs = POSTS.map((post) => post.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses url-safe slugs', () => {
    for (const post of POSTS) {
      expect(post.slug, post.title).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('gives every post a title, an excerpt, a tag, and a body', () => {
    for (const post of POSTS) {
      expect(post.title.trim(), post.slug).not.toBe('');
      expect(post.seoTitle.trim(), post.slug).not.toBe('');
      expect(post.seoDescription.trim(), post.slug).not.toBe('');
      expect(post.excerpt.trim(), post.slug).not.toBe('');
      expect(post.tags.length, post.slug).toBeGreaterThan(0);
      expect(post.body.length, post.slug).toBeGreaterThan(0);
    }
  });

  it('renders no empty block', () => {
    for (const post of POSTS) {
      for (const block of post.body) {
        expect(blockText(block).trim(), `${post.slug}/${block.type}`).not.toBe('');
      }
    }
  });

  it('gives every heading in a post its own anchor', () => {
    for (const post of POSTS) {
      const ids = post.body
        .filter((block) => block.type === 'heading' || block.type === 'subheading')
        .map((block) => headingId(blockText(block)));
      expect(new Set(ids).size, post.slug).toBe(ids.length);
    }
  });

  it('omits optional byline fields rather than storing a placeholder', () => {
    for (const post of POSTS) {
      for (const field of [
        'date',
        'dateModified',
        'readTime',
        'author',
        'authorRole',
        'authorUrl',
      ] as const) {
        const value = post[field];
        if (value !== undefined) expect(value.trim(), `${post.slug}.${field}`).not.toBe('');
      }
    }
  });

  it('bylines every post with a person from ./people, never a free-typed name', () => {
    const known = new Map([FOUNDER, PRODUCT_HEAD].map((person) => [person.name, person] as const));
    for (const post of POSTS) {
      const person = post.author ? known.get(post.author) : undefined;
      expect(person, `${post.slug} author`).toBeDefined();
      expect(post.authorRole, post.slug).toBe(person!.role);
      expect(post.authorUrl, post.slug).toBe(person!.linkedin);
    }
  });

  it('dates every post, and never revises one before it was published', () => {
    for (const post of POSTS) {
      expect(post.date, post.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(post.date!)), post.slug).toBe(false);
      if (post.dateModified === undefined) continue;
      expect(post.dateModified, post.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.dateModified >= post.date!, `${post.slug} revised before publication`).toBe(true);
    }
  });

  it('resolves every citation against a unique, safe structured source', () => {
    for (const post of POSTS) {
      const sourceIds = post.sources.map((source) => source.id);
      expect(new Set(sourceIds).size, post.slug).toBe(sourceIds.length);
      for (const source of post.sources) {
        expect(source.id, post.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(['http:', 'https:'], `${post.slug}/${source.id}`).toContain(
          new URL(source.url).protocol,
        );
      }
      for (const block of post.body) {
        if (block.type !== 'richParagraph') continue;
        for (const part of block.content) {
          if (typeof part !== 'string' && part.type === 'citation') {
            expect(sourceIds, `${post.slug}/${part.sourceId}`).toContain(part.sourceId);
          }
        }
      }
    }
  });

  it('links every post to valid related guides and solutions without self-links', () => {
    const slugs = POSTS.map((post) => post.slug);
    for (const post of POSTS) {
      expect(new Set(post.relatedSlugs).size, post.slug).toBe(post.relatedSlugs.length);
      expect(post.relatedSlugs, post.slug).not.toContain(post.slug);
      for (const slug of post.relatedSlugs) expect(slugs, `${post.slug}/${slug}`).toContain(slug);
      const internalLinks = post.body.flatMap((block) =>
        block.type === 'richParagraph'
          ? block.content.flatMap((part) =>
              typeof part !== 'string' && part.type === 'link' ? [part.href] : [],
            )
          : [],
      );
      expect(
        [...internalLinks, post.closing?.secondary?.href].some(
          (href) => href === '/solutions' || PUBLISHED_PLATFORM.some((item) => item.href === href),
        ),
        post.slug,
      ).toBe(true);
      expect(
        internalLinks.some((href) => href.startsWith('/blog/')),
        post.slug,
      ).toBe(true);
    }
  });
});

describe('comparison content', () => {
  it('names every competitor uniquely', () => {
    const names = COMPETITORS.map((competitor) => competitor.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('faq and solutions content', () => {
  it('gives every FAQ group at least one answered question', () => {
    expect(FAQ_GROUPS.length).toBeGreaterThan(0);
    for (const group of FAQ_GROUPS) {
      expect(group.items.length, group.heading).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.q.trim(), group.heading).not.toBe('');
        expect(item.a.trim(), item.q).not.toBe('');
      }
    }
  });

  it('gives every team on Solutions its own product screen', () => {
    const screens = SOLUTION_SEGMENTS.map((segment) => segment.screen);
    expect(screens.length).toBeGreaterThan(0);
    expect(new Set(screens).size).toBe(screens.length);
  });
});

describe('legal content', () => {
  it('publishes each policy under a distinct path', () => {
    const paths = ALL_LEGAL.map((document) => document.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('never publishes an unfilled placeholder or an unresolved internal path', () => {
    for (const document of ALL_LEGAL) {
      const text = stringsIn(document.sections).join(' ');
      expect(text, document.path).not.toMatch(
        /\[[A-Z_]{3,}\]|to be completed|\bpending\b|\bTBD\b/i,
      );
      for (const path of text.match(/(?<=\s)\/[a-z][a-z-]*(?=[\s.,]|$)/g) ?? []) {
        expect(marketingRouteExists(path), `${document.path} → ${path}`).toBe(true);
      }
    }
  });

  it('gives every section an id, a title, and some content', () => {
    for (const document of ALL_LEGAL) {
      expect(document.sections.length, document.path).toBeGreaterThan(0);
      for (const section of document.sections) {
        expect(section.id.trim(), `${document.path}/${section.title}`).not.toBe('');
        expect(section.title.trim(), `${document.path}/${section.id}`).not.toBe('');
        const hasContent =
          (section.paragraphs?.length ?? 0) > 0 ||
          (section.bullets?.length ?? 0) > 0 ||
          (section.table?.rows.length ?? 0) > 0 ||
          Boolean(section.note?.trim());
        expect(hasContent, `${document.path}/${section.id}`).toBe(true);
      }
    }
  });

  it('uses unique section ids within a document so anchors resolve', () => {
    for (const document of ALL_LEGAL) {
      const ids = document.sections.map((section) => section.id);
      expect(new Set(ids).size, document.path).toBe(ids.length);
    }
  });
});

const RESEARCH_DIR = resolve(import.meta.dirname, 'blog-posts/research');

describe('commercial positioning', () => {
  const everyString = [
    ...POSTS.flatMap((post) => [post.title, post.excerpt, ...post.body.map(blockText)]),
    ...FAQ_GROUPS.flatMap((group) => group.items.flatMap((item) => [item.q, item.a])),
    ...Object.values(PLAN_PRESENTATION).map((plan) => plan.blurb),
    ...stringsIn(COMPETITORS),
    ...readdirSync(RESEARCH_DIR).map((file) => readFileSync(resolve(RESEARCH_DIR, file), 'utf8')),
    ...ALL_LEGAL.flatMap((document) =>
      document.sections.flatMap((section) => [
        ...(section.paragraphs ?? []),
        ...(section.bullets ?? []),
        section.note ?? '',
      ]),
    ),
  ].join('\n');

  it.each(['MIT license', 'CiteLadder Cloud', 'github.com/Cube-27'])(
    'makes no %j claim',
    (phrase) => {
      expect(everyString.toLowerCase()).not.toContain(phrase.toLowerCase());
    },
  );
});

describe('entity profiles', () => {
  it('exposes LinkedIn profiles', () => {
    expect(PRODUCT_HEAD.linkedin).toMatch(/^https:\/\/www\.linkedin\.com\//);
    expect(FOUNDER.linkedin).toMatch(/^https:\/\/www\.linkedin\.com\//);
    expect(CITELADDER_LINKEDIN).toMatch(/^https:\/\/www\.linkedin\.com\/company\//);
  });
});

describe('legal tables', () => {
  it('gives every table row one cell per heading', () => {
    for (const document of ALL_LEGAL) {
      for (const section of document.sections) {
        for (const row of section.table?.rows ?? []) {
          expect(row.length, `${document.path}/${section.id}/${row[0]}`).toBe(
            section.table?.headings.length,
          );
        }
      }
    }
  });
});
