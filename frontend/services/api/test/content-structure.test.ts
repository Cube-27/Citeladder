import { describe, expect, it } from 'vitest';
import type { ContentPage } from '@citeladder/contracts/site-health';

import {
  anchorCandidates,
  linkCandidates,
  topicCandidates,
} from '../src/site-health/content-candidates.ts';
import { contentRequest } from '../src/site-health/content-requests.ts';
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
    probabilities.none = 0.99;
    expect(
      selectedAnchor(candidate, {
        type: 'choice',
        choice: 'none',
        confidence: 0.99,
        probabilities,
      }),
    ).toEqual({ anchor: null, confidence: 0.99 });
    probabilities.none = 0.98;
    expect(
      selectedAnchor(candidate, {
        type: 'choice',
        choice: 'none',
        confidence: 0.98,
        probabilities,
      }),
    ).toBeNull();
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
    expect(projectContent(manifest, new Map()).state).toBe('running');
    const unavailable = new Map(
      manifest.candidates.map((candidate) => [
        candidate.id,
        { state: 'unavailable', reason: 'funding_unavailable' },
      ]),
    );
    expect(projectContent(manifest, unavailable).state).toBe('unavailable');
    expect(projectContent(manifest, unavailable).diagnostics.reasons.funding_unavailable).toBe(
      manifest.candidates.length,
    );
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
      page: item.analysis_id,
      passage: null,
      labels: [{ label: 'Garden care', source: sourceId }],
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

  it('retains a classified topic with one page without inventing internal links', () => {
    const pages = [page(sourceId, 'Garden care', 'Healthy soil supports plants.')];
    // A same-page fragment link is not a connection to another topic member.
    pages[0]!.contextual_targets = [pages[0]!.url];
    const candidates = topicCandidates(pages).candidates;
    const outcomes = new Map(
      candidates.map((candidate) => [
        candidate.id,
        {
          state: 'completed',
          answers: {
            membership: { type: 'noul', noul: 0.9 },
            label: {
              type: 'choice',
              choice: '0',
              confidence: 0.9,
              probabilities: { '0': 0.9, none: 0.1 },
            },
          },
        },
      ]),
    );
    const result = projectContent(
      { pages, candidates, policy: policy.content_structure },
      outcomes,
    );
    expect(result.topics).toEqual([
      expect.objectContaining({
        label: 'Garden care',
        page_ids: [sourceId],
        contextual_links: 0,
        recommendation_ids: [],
      }),
    ]);
    expect(result.unassigned_pages).toBe(0);
    expect(result.diagnostics.singleton_topics).toBe(1);
  });

  it('publishes frozen topic answers admitted before the classifier cutover', () => {
    const pages = [
      page(sourceId, 'Garden care', 'Healthy soil supports plants.'),
      page(targetId, 'Garden soil', 'Healthy soil improves plant growth.'),
    ];
    const candidates = pages.map((item) => ({
      id: item.analysis_id,
      kind: 'topic',
      page: item.analysis_id,
      label: 'Garden care',
      source: sourceId,
    }));
    const outcomes = new Map(
      candidates.map((candidate) => [
        candidate.id,
        {
          state: 'completed',
          answers: {
            membership: { type: 'noul', noul: 0.9 },
            label: {
              type: 'choice',
              choice: 'label',
              confidence: 0.9,
              probabilities: { label: 0.9, none: 0.1 },
            },
          },
        },
      ]),
    );
    const result = projectContent(
      { pages, candidates, policy: { membership_threshold: 0.85 } },
      outcomes,
    );
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0]!.page_ids).toEqual([sourceId, targetId]);
  });

  it('offers semantically possible anchors and targets even without matching keywords', () => {
    const source = page(
      sourceId,
      'Summer comfort',
      'Compare lightweight options for hot Australian summers.',
    );
    const target = page(targetId, "Women's Linen Collection", 'Breathable natural fabric dresses.');
    const candidate = linkCandidates([source, target]).candidates.find(
      (item) => item.source === sourceId,
    )!;
    expect(candidate.target).toBe(targetId);
    expect(candidate.anchors.some((anchor) => anchor.text === 'lightweight options')).toBe(true);
    source.passages[0]!.linked_ranges = [{ start: 8, end: 27 }];
    expect(
      anchorCandidates(source.passages[0]!, target).some(
        (anchor) => anchor.text === 'lightweight options',
      ),
    ).toBe(false);
  });

  it('gives every source a target budget instead of spending a global cap on early pages', () => {
    const pages = Array.from({ length: 20 }, (_, index) =>
      page(
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        `Garden subject ${index}`,
        `Explore garden subject ${index} with practical advice and examples.`,
      ),
    );
    const candidates = linkCandidates(pages).candidates;
    expect(candidates.length).toBeGreaterThan(100);
    expect(new Set(candidates.map((candidate) => candidate.source)).size).toBe(20);
    for (const source of pages)
      expect(
        candidates.filter((candidate) => candidate.source === source.analysis_id),
      ).toHaveLength(policy.content_structure.targets_per_page);
  });

  it('lets JEV classify nonmatching pages into source-grounded labels, including several topics', () => {
    const pages = [
      page(sourceId, 'Linen collection | Acme', 'Breathable natural fabric dresses for women.'),
      page(targetId, 'Summer comfort | Acme', 'Lightweight options for hot Australian summers.'),
    ];
    const candidates = topicCandidates(pages).candidates;
    const labels = candidates[0]!.labels;
    expect(labels.some((label) => label.label === 'Summer comfort')).toBe(true);
    const outcomes = new Map(
      candidates.map((candidate) => {
        const selected = candidate.passage ? 'Summer comfort' : 'Linen collection';
        const key = String(labels.findIndex((label) => label.label === selected));
        return [
          candidate.id,
          {
            state: 'completed',
            answers: {
              membership: { type: 'noul', noul: 0.75 },
              label: {
                type: 'choice',
                choice: key,
                confidence: 0.6,
                probabilities: Object.fromEntries(
                  ['none', ...labels.map((_, index) => String(index))].map((option) => [
                    option,
                    option === key ? 1 : 0,
                  ]),
                ),
              },
            },
          },
        ];
      }),
    );
    const result = projectContent(
      { pages, candidates, policy: policy.content_structure },
      outcomes,
    );
    expect(result.topics.map((topic) => topic.label).sort()).toEqual([
      'Linen collection',
      'Summer comfort',
    ]);
    expect(result.topics.every((topic) => topic.page_ids.length === 2)).toBe(true);
    const request = contentRequest(candidates[0]!, pages);
    expect(Object.keys(request.questions.label!.criteria)).toHaveLength(labels.length + 1);
  });
});
