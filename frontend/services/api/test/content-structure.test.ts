import { describe, expect, it } from 'vitest';
import type { ContentPage } from '@citeladder/contracts/site-health';

import { anchorCandidates, linkCandidates } from '../src/site-health/content-candidates.ts';
import { projectContent, selectedAnchor } from '../src/site-health/content-publish.ts';
import { policy } from '../src/config.ts';
import { contextualLinkObserved } from '../src/opportunities/content-verification.ts';

function page(id: string, title: string, text: string): ContentPage {
  return {
    analysis_id: id,
    artifact_id: id,
    site_url_id: id,
    url: `https://example.com/${id}`,
    title,
    excerpt: text,
    headings: [title],
    passages: [{ locator: '/main/p', heading: title, text, linked_ranges: [] }],
    contextual_targets: [],
    navigation_targets: [],
    links_complete: true,
    eligible_target: true,
    extractor_version: '1',
  };
}
const sourceId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';

describe('content structure', () => {
  it('verifies only contextual links with declared anchors and detects their later removal', () => {
    const check = {
      target_url: 'https://example.com/soil',
      anchor_text: 'healthy soil',
      extractor_version: '1',
    };
    const facts = {
      extraction: { state: 'available', truncated: false },
      extractor_version: '1',
      content_structure: { links_complete: true },
      delivery: { final_url: 'https://example.com/garden' },
      links: { anchors: [{ url: '/soil', anchor_text: 'healthy soil', region: 'nav' }] },
    };
    expect(contextualLinkObserved(facts, check)).toBe(false);
    facts.links.anchors[0]!.region = 'main';
    expect(contextualLinkObserved(facts, check)).toBe(true);
    facts.links.anchors = [];
    expect(contextualLinkObserved(facts, check)).toBe(false);
    facts.content_structure.links_complete = false;
    expect(contextualLinkObserved(facts, check)).toBeNull();
  });
  it('allows navigation-only destinations, excludes contextual destinations and linked spans', () => {
    const source = page(
      sourceId,
      'Garden care',
      'Learn about healthy garden soil before choosing plants for your garden.',
    );
    const target = page(
      targetId,
      'Healthy garden soil',
      'Healthy garden soil improves plant growth.',
    );
    source.navigation_targets = [target.url];
    const result = linkCandidates([source, target]);
    expect(
      result.candidates.some(
        (candidate) => candidate.source === sourceId && candidate.target === targetId,
      ),
    ).toBe(true);
    source.contextual_targets = [target.url];
    expect(
      linkCandidates([source, target]).candidates.some(
        (candidate) => candidate.source === sourceId,
      ),
    ).toBe(false);
    source.passages[0]!.linked_ranges = [{ start: 0, end: source.passages[0]!.text.length }];
    expect(anchorCandidates(source.passages[0]!, target)).toEqual([]);
  });

  it('withholds malformed anchor answers and accepts the explicit no-match branch', () => {
    const pages = [
      page(sourceId, 'Garden care', 'Learn about healthy garden soil before choosing plants.'),
      page(targetId, 'Healthy garden soil', 'Healthy garden soil improves plant growth.'),
    ];
    const candidate = linkCandidates(pages).candidates[0]!;
    expect(
      selectedAnchor(candidate, {
        type: 'choice',
        choice: '42',
        confidence: 1,
        probabilities: { '42': 1 },
      }),
    ).toBeNull();
    const probabilities = Object.fromEntries(
      ['none', ...candidate.anchors.map((_, index) => String(index))].map((key) => [
        key,
        key === 'none' ? 1 : 0,
      ]),
    );
    expect(
      selectedAnchor(candidate, { type: 'choice', choice: 'none', confidence: 1, probabilities }),
    ).toEqual({ anchor: null, confidence: 1 });
  });

  it('keeps missing judgments and omitted passages separate from completed-empty results', () => {
    const pages = [
      page(sourceId, 'Garden care', 'Learn about healthy garden soil before choosing plants.'),
      page(targetId, 'Healthy garden soil', 'Healthy garden soil improves plant growth.'),
    ];
    const manifest = {
      pages,
      candidates: linkCandidates(pages).candidates,
      policy: policy.content_structure,
      omitted_pages: 0,
      omitted_passages: 0,
      omitted_candidates: 0,
    };
    expect(projectContent(manifest, new Map()).state).toBe('unavailable');
    expect(
      projectContent({ ...manifest, candidates: [], omitted_passages: 1 }, new Map()).state,
    ).toBe('partial');
    expect(projectContent({ ...manifest, candidates: [] }, new Map()).state).toBe('completed');
  });

  it('withholds topics when the label distribution is malformed', () => {
    const pages = [
      page(sourceId, 'Garden care', 'Healthy garden soil supports plants.'),
      page(targetId, 'Garden soil', 'Garden soil improves plant growth.'),
    ];
    const candidates = pages.map((item) => ({
      id: item.analysis_id,
      kind: 'topic',
      label: 'Garden care',
      source: sourceId,
      page: item.analysis_id,
    }));
    const outcomes = new Map(
      candidates.map((candidate) => [
        candidate.id,
        {
          state: 'completed',
          answers: {
            membership: { type: 'noul', noul: 0.99 },
            label: { type: 'choice', choice: 'label', confidence: 1, probabilities: { bogus: 1 } },
          },
        },
      ]),
    );
    const result = projectContent(
      { pages, candidates, policy: policy.content_structure },
      outcomes,
    );
    expect(result.state).toBe('unavailable');
    expect(result.topics).toEqual([]);
  });
});
