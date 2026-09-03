// @vitest-environment node
//
// Pure logic: no DOM, no window, no React render. The suite-wide jsdom
// default costs a full environment per file and buys nothing here.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { headingId } from '@/components/marketing/blog/post-blocks';

import { POSTS, type BlogBlock } from './blog';
import { COMPETITORS, FACT_ROWS, FAIRNESS_POINTS } from './compare';
import { FAQ_GROUPS } from './faq';
import {
  AI_POLICY,
  COOKIE_POLICY,
  FOOTER_LEGAL_LINKS,
  PARENT_COMPANY,
  type LegalDocument,
} from './legal';
import { LLMS_TXT } from './llms';
import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF, NAV_DROPS, NAV_LINKS, type NavDropItem } from './nav';
import { FOUNDER, PRODUCT_HEAD } from './people';
import { PLAN_PRESENTATION, capabilityLabel } from './pricing';
import { CONTACT_EMAIL } from './social';
import { SOLUTION_SEGMENTS } from './solutions';

/**
 * `lib/marketing-content` is the public surface's copy, and it had no tests.
 *
 * These are STRUCTURAL, not snapshots. A snapshot of 1,500 lines of marketing
 * copy fails on every deliberate wording change and proves nothing; what is
 * actually worth catching is a route that does not exist, a duplicate blog
 * slug, an empty section that renders as a blank block, and — the rule the
 * repository already enforces at E2E level — a commercial page claiming the
 * product is open source or self-hostable.
 */
/**
 * The policies this product publishes. Privacy and Terms are the PARENT
 * company's documents and live on cube27.com, so they are asserted as
 * external footer links rather than as local documents.
 */
const ALL_LEGAL: readonly LegalDocument[] = [COOKIE_POLICY, AI_POLICY];

/** Every internal href declared anywhere in the marketing content. */
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
    ...FOOTER_LEGAL_LINKS.filter((link) => !link.external).map((link) => link.href),
  ];
}

function blockText(block: BlogBlock): string {
  switch (block.type) {
    case 'list':
      return block.items.join(' ');
    case 'table':
      return [...block.headers, ...block.rows.flat()].join(' ');
    case 'checklist':
      return block.items.map((item) => `${item.title} ${item.description}`).join(' ');
    case 'diagram':
      return `${block.title ?? ''} ${JSON.stringify(block.data)}`;
    case 'callout':
      return `${block.title ?? ''} ${block.text}`;
    case 'subheading':
    case 'heading':
    case 'paragraph':
    default:
      return block.text;
  }
}

function marketingRouteFile(href: string): string {
  const pathname = href.split('#', 1)[0].replace(/^\//, '');
  return resolve(import.meta.dirname, '../../app/(marketing)', pathname, 'page.tsx');
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

describe('marketing navigation', () => {
  it('routes every internal link from the site root', () => {
    // Anchors are absolute (`/#see-it`) so a row resolves from a subpage,
    // not only from `/`.
    for (const href of internalHrefs()) {
      expect(href, href).toMatch(/^\/(?:$|[a-z0-9#/-])/);
      expect(existsSync(marketingRouteFile(href)), href).toBe(true);
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

  it('sends the demo funnel to the parent company contact form', () => {
    // CiteLadder is a Cube27 product and does not own a demo form, so the
    // funnel leaves the site. An absolute https destination is the contract —
    // a relative href here would 404 now that `/demo` is gone.
    expect(DEMO_HREF).toBe('https://www.cube27.com/contact/');
    expect(DEMO_EXTERNAL).toBe(true);
    expect(DEMO_CTA.trim()).not.toBe('');
  });
});

describe('pricing content', () => {
  it('blurbs every plan key', () => {
    for (const [key, plan] of Object.entries(PLAN_PRESENTATION)) {
      expect(plan.blurb.trim(), key).not.toBe('');
    }
  });

  it('highlights exactly one plan', () => {
    // Two highlighted plans is a layout bug that reads as an unmade decision.
    const highlighted = Object.values(PLAN_PRESENTATION).filter((plan) => plan.highlighted);
    expect(highlighted).toHaveLength(1);
  });

  it('humanises an unmapped capability key instead of rendering nothing', () => {
    // A capability key the backend adds must still produce a readable string:
    // the helper returns a string in every branch so React can render it.
    expect(capabilityLabel('a_brand_new_capability')).toBe('A brand new capability');
    expect(capabilityLabel('')).toBe('');
  });
});

describe('blog content', () => {
  it('has unique slugs', () => {
    // A duplicate slug makes one post permanently unreachable at
    // `/blog/[slug]`.
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
    // The contents rail links each heading by its slugged text. Two headings
    // that slug alike within one post share an `id`, so the second entry
    // silently jumps to the first section. Retitle one rather than relax this.
    for (const post of POSTS) {
      const ids = post.body
        .filter((block) => block.type === 'heading' || block.type === 'subheading')
        .map((block) => headingId(blockText(block)));
      expect(new Set(ids).size, post.slug).toBe(ids.length);
    }
  });

  it('omits optional byline fields rather than storing a placeholder', () => {
    // The module's rule: while a byline field is absent the row is omitted, so
    // an empty string would render an empty byline instead of none.
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

  it('publishes a named author and review date on every post', () => {
    expect(POSTS[0]?.author).toBe('Arpan Jain');
    expect(POSTS[0]?.authorRole).toBe('Founder & CEO');
    for (const post of POSTS.slice(1)) {
      expect(post.author, post.slug).toBe('Abhineet Jain');
      expect(post.authorRole, post.slug).toBe('Product Head');
    }
    for (const post of POSTS) {
      expect(post.date, post.slug).toBe('2026-09-03');
    }
  });
});

describe('comparison content', () => {
  it('names every competitor uniquely', () => {
    const names = COMPETITORS.map((competitor) => competitor.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('states the fairness position and the fact rows', () => {
    expect(FAIRNESS_POINTS.length).toBeGreaterThan(0);
    expect(FACT_ROWS.length).toBeGreaterThan(0);
  });

  it('gives every competitor a unique lead and meta description', () => {
    const leads = COMPETITORS.map((competitor) => competitor.lead);
    const metas = COMPETITORS.map((competitor) => competitor.metaDescription);
    expect(new Set(leads).size).toBe(leads.length);
    expect(new Set(metas).size).toBe(metas.length);
    for (const competitor of COMPETITORS) {
      expect(competitor.lead.length, competitor.slug).toBeGreaterThan(80);
      expect(competitor.metaDescription.length, competitor.slug).toBeLessThan(170);
    }
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

  it('gives every solution segment a renderable scene', () => {
    const scenes = new Set(['share', 'health', 'sample', 'commerce', 'citations']);
    expect(SOLUTION_SEGMENTS.length).toBeGreaterThan(0);
    for (const segment of SOLUTION_SEGMENTS) {
      expect(scenes.has(segment.scene), segment.scene).toBe(true);
    }
  });
});

describe('legal content', () => {
  it('publishes each policy under a distinct slug', () => {
    const slugs = ALL_LEGAL.map((document) => document.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('links every published policy from the footer', () => {
    // A policy with no route out of the footer is effectively unpublished.
    const linked = new Set(
      FOOTER_LEGAL_LINKS.filter((link) => !link.external).map((link) =>
        link.href.replace(/^\//, ''),
      ),
    );
    for (const document of ALL_LEGAL) {
      expect(linked.has(document.slug), document.slug).toBe(true);
    }
  });

  it('sends the corporate policies to the parent company, not to a local copy', () => {
    // Privacy and Terms bind Cube27, and a second copy of a policy is one that
    // goes stale silently — so these must stay absolute and external.
    const external = FOOTER_LEGAL_LINKS.filter((link) => link.external);
    expect(external.map((link) => link.label).sort()).toEqual([
      'Privacy Policy',
      'Terms of Service',
    ]);
    for (const link of external) {
      expect(link.href, link.label).toMatch(/^https:\/\/www\.cube27\.com\//);
    }
    expect(PARENT_COMPANY.name).toBe('Cube27');
    expect(PARENT_COMPANY.legalName).toBe('Cube27 IT Pvt. Ltd.');
    expect(PARENT_COMPANY.address).toMatch(/Pune/);
  });

  it('gives every section an id, a title, and some content', () => {
    for (const document of ALL_LEGAL) {
      expect(document.sections.length, document.slug).toBeGreaterThan(0);
      for (const section of document.sections) {
        expect(section.id.trim(), `${document.slug}/${section.title}`).not.toBe('');
        expect(section.title.trim(), `${document.slug}/${section.id}`).not.toBe('');
        const hasContent =
          (section.paragraphs?.length ?? 0) > 0 ||
          (section.bullets?.length ?? 0) > 0 ||
          Boolean(section.note?.trim());
        expect(hasContent, `${document.slug}/${section.id}`).toBe(true);
      }
    }
  });

  it('uses unique section ids within a document so anchors resolve', () => {
    for (const document of ALL_LEGAL) {
      const ids = document.sections.map((section) => section.id);
      expect(new Set(ids).size, document.slug).toBe(ids.length);
    }
  });
});

describe('commercial positioning', () => {
  const everyString = [
    ...POSTS.flatMap((post) => [post.title, post.excerpt, ...post.body.map(blockText)]),
    ...FAQ_GROUPS.flatMap((group) => group.items.flatMap((item) => [item.q, item.a])),
    ...Object.values(PLAN_PRESENTATION).map((plan) => plan.blurb),
    ...stringsIn(COMPETITORS),
    ...stringsIn(FAIRNESS_POINTS),
    ...stringsIn(FACT_ROWS),
    ...ALL_LEGAL.flatMap((document) =>
      document.sections.flatMap((section) => [
        ...(section.paragraphs ?? []),
        ...(section.bullets ?? []),
        section.note ?? '',
      ]),
    ),
  ].join('\n');

  it.each(['MIT license', 'open source', 'open-source', 'self-host', 'github.com'])(
    'makes no %j claim',
    (phrase) => {
      // CiteLadder is a commercial product. The E2E suite asserts this on the
      // rendered pages; this catches it in the content module, where it is
      // cheaper to find and impossible to miss on a page nobody screenshots.
      expect(everyString.toLowerCase()).not.toContain(phrase.toLowerCase());
    },
  );
});

describe('entity and llms.txt', () => {
  it('exposes a public contact email and LinkedIn profiles', () => {
    expect(CONTACT_EMAIL).toBe('abhineet.jain@cube27.com');
    expect(PRODUCT_HEAD.linkedin).toMatch(/^https:\/\/www\.linkedin\.com\//);
    expect(FOUNDER.linkedin).toMatch(/^https:\/\/www\.linkedin\.com\//);
    expect(PARENT_COMPANY.linkedin).toMatch(/^https:\/\/www\.linkedin\.com\//);
  });

  it('publishes a machine-readable product brief', () => {
    expect(LLMS_TXT).toContain('# CiteLadder');
    expect(LLMS_TXT).toContain('Abhineet Jain');
    expect(LLMS_TXT).toContain('Arpan Jain');
    expect(LLMS_TXT).toContain('https://citeladder.com/faq');
    expect(LLMS_TXT.toLowerCase()).toContain('not an open-source');
  });
});
