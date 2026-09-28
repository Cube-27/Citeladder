import { describe, expect, it } from 'vitest';
import type { InternalLinkPage } from '@citeladder/contracts/site-health';

import {
  anchorOptions,
  isVariant,
  linkCandidates,
} from '../src/site-health/internal-link-candidates.ts';
import { projectLinks } from '../src/site-health/internal-link-publish.ts';
import { policy } from '../src/config.ts';
import { contextualLinkObserved } from '../src/opportunities/internal-link-verification.ts';
import { linkUrl } from '../src/site-health/internal-link-pages.ts';

let counter = 0;
function page(title: string, overrides: Partial<InternalLinkPage> = {}): InternalLinkPage {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  const slug = title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
  return {
    analysis_id: id,
    artifact_id: id,
    site_url_id: id,
    url: `https://example.com/${slug}`,
    title: `${title} | Acme`,
    h1: title,
    description: '',
    excerpt: '',
    page_kind: 'article',
    contextual_inbound: 0,
    contextual_targets: [],
    links_complete: true,
    eligible_target: true,
    extractor_version: '1',
    ...overrides,
  };
}
const pairs = (pages: InternalLinkPage[]) =>
  linkCandidates(pages).map((candidate) => [candidate.source, candidate.target]);

describe('internal link candidates', () => {
  it('suggests related unlinked pages and never a self, linked or ineligible destination', () => {
    const source = page('Garden soil guide');
    const related = page('Soil testing kit');
    const linked = page('Healthy soil compost');
    const noindex = page('Soil pH chart', { eligible_target: false });
    source.contextual_targets = [linked.url];
    const found = pairs([source, related, linked, noindex]).filter(
      ([from]) => from === source.analysis_id,
    );
    expect(found).toEqual([[source.analysis_id, related.analysis_id]]);
  });

  it('makes no suggestion from a page whose link capture was truncated', () => {
    const source = page('Garden soil guide', { links_complete: false });
    const target = page('Soil testing kit');
    expect(pairs([source, target]).some(([from]) => from === source.analysis_id)).toBe(false);
  });

  it('skips colour variants of the same product and keeps one destination per product family', () => {
    const product = (title: string) => page(title, { page_kind: 'product' });
    const source = product('Black Hi-Cut Cotton Bikini');
    const variant = product('White Hi-Cut Cotton Bikini');
    const familyA = product('Black Lace Front Bikini');
    const familyB = product('White Lace Front Bikini');
    expect(isVariant(source, variant)).toBe(true);
    const targets = pairs([source, variant, familyA, familyB])
      .filter(([from]) => from === source.analysis_id)
      .map(([, to]) => to);
    expect(targets).not.toContain(variant.analysis_id);
    expect(targets).toHaveLength(1);
    expect([familyA.analysis_id, familyB.analysis_id]).toContain(targets[0]);
  });

  it('gives every source page its own destination budget', () => {
    // Each word is on four pages, so every page has six related neighbours.
    const words = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima'.split(
      ' ',
    );
    const pages = words.map((_, index) =>
      page([0, 1, 2, 3].map((offset) => words[(index + offset) % words.length]).join(' ')),
    );
    const candidates = linkCandidates(pages);
    for (const source of pages)
      expect(candidates.filter((item) => item.source === source.analysis_id)).toHaveLength(
        policy.internal_links.targets_per_page,
      );
  });

  it('offers descriptive destination anchors and rejects identifier slugs', () => {
    const target = page('Bikini Hi-Cut Cotton', {
      url: 'https://example.com/bikini-hi-cut-cotton/LUS1300C_667296_BLACK',
      title: 'Black Bikini Hi-Cut Cotton | Acme',
    });
    expect(anchorOptions(target)).toEqual(['Bikini Hi-Cut Cotton', 'Black Bikini Hi-Cut Cotton']);
    const candidate = linkCandidates([page('Cotton bikini care'), target]).find(
      (item) => item.target === target.analysis_id,
    )!;
    const question = candidate.request.questions.anchor as { criteria: Record<string, string> };
    expect(Object.values(question.criteria)).toEqual(anchorOptions(target));
  });
});

describe('internal link publication', () => {
  const source = page('Garden soil guide');
  const target = page('Soil testing kit', { h1: 'Home soil testing' });
  const manifest = {
    pages: [source, target],
    candidates: linkCandidates([source, target]),
    policy: policy.internal_links,
    omitted_pages: 0,
  };
  const completed = (noul: number, anchor?: unknown) => ({
    state: 'completed',
    answers: { link: { type: 'noul', noul }, anchor },
  });
  const outcomes = (value: unknown) =>
    new Map(manifest.candidates.map((candidate) => [candidate.id, value]));

  it('keeps pending, unavailable, empty and partial results distinct', () => {
    expect(projectLinks(manifest, new Map()).state).toBe('running');
    const unavailable = projectLinks(
      manifest,
      outcomes({ state: 'unavailable', reason: 'funding_unavailable' }),
    );
    expect(unavailable.state).toBe('unavailable');
    expect(unavailable.diagnostics.reasons.funding_unavailable).toBe(manifest.candidates.length);
    const rejected = projectLinks(manifest, outcomes(completed(0.1)));
    expect(rejected.state).toBe('completed');
    expect(rejected.recommendations).toEqual([]);
    expect(rejected.diagnostics.below_threshold).toBe(manifest.candidates.length);
    expect(projectLinks({ ...manifest, omitted_pages: 3 }, outcomes(completed(0.1))).state).toBe(
      'partial',
    );
  });

  it('publishes accepted links with the chosen anchor, falling back to the first option', () => {
    const chosen = projectLinks(
      manifest,
      outcomes(completed(0.9, { type: 'choice', choice: 'a1' })),
    );
    const toTarget = (result: ReturnType<typeof projectLinks>) =>
      result.recommendations.find((link) => link.target.analysis_id === target.analysis_id)!;
    expect(toTarget(chosen).anchor).toBe('Soil testing kit');
    const malformed = projectLinks(manifest, outcomes(completed(0.9, { choice: 'none' })));
    expect(toTarget(malformed).anchor).toBe('Home soil testing');
  });
});

describe('internal link URLs', () => {
  it('drops click-tracking parameters but keeps meaningful query identity', () => {
    expect(linkUrl('/shop?srsltid=abc&utm_source=x&color=red#top', 'https://example.com/')).toBe(
      'https://example.com/shop?color=red',
    );
  });
});

describe('internal link verification', () => {
  it('accepts any main-content link to the destination and detects its removal', () => {
    const check = { target_url: 'https://example.com/soil', extractor_version: '1' };
    const facts = {
      extraction: { state: 'available', truncated: false },
      extractor_version: '1',
      delivery: { final_url: 'https://example.com/garden' },
      links: {
        anchors_truncated: false,
        anchors: [{ url: '/soil', anchor_text: 'reworded', region: 'nav' }],
      },
    };
    expect(contextualLinkObserved(facts, check)).toBe(false);
    facts.links.anchors[0]!.region = 'main';
    expect(contextualLinkObserved(facts, check)).toBe(true);
    facts.links.anchors[0]!.region = 'unknown';
    expect(contextualLinkObserved(facts, check)).toBeNull();
    facts.links.anchors = [];
    expect(contextualLinkObserved(facts, check)).toBe(false);
    facts.links.anchors_truncated = true;
    expect(contextualLinkObserved(facts, check)).toBeNull();
  });
});
