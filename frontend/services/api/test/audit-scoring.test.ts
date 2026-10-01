import { describe, expect, it } from 'vitest';
import { scoreExecution, scoringConfig } from '../src/analysis/scoring.ts';
import { assessEntities } from '../src/analysis/entity-assessment.ts';
import { citationIdentity } from '../src/source-pages/identity.ts';
import { normalizeAlias, firstAliasOffset } from '../src/analysis/aliases.ts';
const config = scoringConfig({
  brand_name: 'Best & Less',
  brand_aliases: ['Bestandless'],
  owned_domains: ['bestandless.example'],
  unintended_domains: ['old.example'],
  products_services: ['running shoes'],
  competitors: [{ name: 'Rival', domains: ['rival.example'] }],
});
describe('frozen deterministic execution scoring', () => {
  it('distinguishes prompt contamination, query availability, mention order and qualified citations', () => {
    const score = scoreExecution({
      config,
      answerText: '😀 Rival first. Then bestandless.',
      promptText: 'Compare Rival shoes',
      searchUsed: true,
      queryTextAvailable: true,
      searchEvents: [{ query: 'best bestandless running shoes review' }],
      citations: [
        { url: 'https://bestandless.example/shoes', title: 'Running shoes' },
        { url: 'https://rival.example/shoes' },
        { url: 'https://old.example/history' },
      ],
    });
    expect(score).toMatchObject({
      brand_mentioned: true,
      brand_injected_in_search: true,
      prompt_class: 'mixed',
      competitors_injected_in_search: [],
      brand_position: 2,
      owned_citation_count: 1,
      qualified_owned_citation_count: 1,
      competitor_domains_cited: ['Rival'],
      unintended_domain_cited: true,
      fanout_features: ['comparison', 'review'],
    });
    const unavailable = scoreExecution({
      config,
      answerText: '',
      promptText: 'Best & Less shoes',
      searchUsed: true,
      queryTextAvailable: false,
      searchEvents: [],
      citations: [],
    });
    expect(unavailable).toMatchObject({
      brand_mentioned: false,
      brand_first_offset: null,
      brand_position: null,
      brand_injected_in_search: null,
      search_query_text_available: false,
      prompt_class: 'branded',
    });
  });
  it('requires ambiguous brands to be disambiguated and preserves code-point ordering after Unicode folding', () => {
    const target = scoringConfig({ brand_name: 'Target' });
    const score = (answerText: string) =>
      scoreExecution({
        config: target,
        answerText,
        promptText: '',
        searchUsed: false,
        queryTextAvailable: true,
        searchEvents: [],
        citations: [],
      });
    expect(score('the target audience')).toMatchObject({ brand_mentioned: false });
    expect(score('Target price')).toMatchObject({ brand_mentioned: false });
    expect(score('target Australia')).toMatchObject({ brand_mentioned: true });
    expect(score('Shop at Target.')).toMatchObject({ brand_mentioned: true });
    expect(firstAliasOffset('Straße', normalizeAlias('😀 Rival then STRASSE'))).toBe(11);
    expect(firstAliasOffset('DuranDuran', normalizeAlias('Duran DuranDuran'))).toBe(6);
  });
  it('retains first-mention recommendation limits and raw Unicode evidence spans', () => {
    for (const tense of ['', 'is ', 'are ', 'was ', 'were ']) {
      expect(assessEntities(`Rival ... ${tense}not recommended.`, config)[1]!.state).toBe(
        'recommended_against',
      );
      expect(assessEntities(`Rival ... ${tense}recommended.`, config)[1]!.state).toBe(
        'recommended',
      );
    }
    const rows = assessEntities(
      '😀 Consider Best&Less. Later we recommend Best and Less. Rival is not recommended.',
      config,
    );
    expect(rows.map((row) => [row.entity_name, row.state])).toEqual([
      ['Best & Less', 'hedged'],
      ['Rival', 'recommended_against'],
    ]);
    const points = Array.from(
      '😀 Consider Best&Less. Later we recommend Best and Less. Rival is not recommended.',
    );
    for (const row of rows)
      for (const span of row.evidence_spans)
        expect(points.slice(span.start, span.end).join('')).toBe(span.text);
    expect(assessEntities('', config).map((row) => row.state)).toEqual([
      'unavailable',
      'unavailable',
    ]);
  });
  it('keeps grounding tokens unresolved and canonicalizes real publisher identity offline', () => {
    const first = citationIdentity('https://publisher.example/shoes?utm_source=engine&size=8#part');
    expect(first.url_hash).toBe(
      citationIdentity('https://publisher.example/shoes?size=8').url_hash,
    );
    expect(
      citationIdentity('https://vertexaisearch.cloud.google.com/grounding-api-redirect/token'),
    ).toMatchObject({ url_identity_method: 'unresolved', url_hash: null });
    expect(citationIdentity('https://user:pass@publisher.example/private')).toMatchObject({
      url_hash: null,
    });
    expect(citationIdentity('https://publisher.example/shoes', true)).toMatchObject({
      resolved_url: 'https://publisher.example/shoes',
      url_identity_method: 'verbatim',
    });
  });
});
