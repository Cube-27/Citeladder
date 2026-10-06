import { describe, expect, it } from 'vitest';
import { extractPageFacts } from '../src/site-health/analysis/facts.ts';
import { analyzePage } from '../src/site-health/analysis/analyze-page.ts';
import { createsIssue, type RuleEvaluation } from '../src/site-health/analysis/rules.ts';

const prose =
  'Teams can investigate website observations and compare practical improvements using a clear record of the evidence they collected during their review.';
const inspect = (html: string, path: string) => {
  const facts = extractPageFacts(Buffer.from(html), {
    finalUrl: `https://example.test${path}`,
    contentType: 'text/html',
    statusCode: 200,
  });
  const result = analyzePage(facts, { sitemapMember: false, siteFacts: null, auditTime: null });
  const rules = new Map<string, RuleEvaluation>(
    result.evaluations.map((row) => [row.rule_id, row]),
  );
  return { facts, result, rules };
};
const grid = (prefix: string, wrapper = '') =>
  `<div class='collection-grid ${wrapper}'>${Array.from(
    { length: 9 },
    (_, index) =>
      `<article><h2><a href='/${prefix}-${index}'>Entry ${index}</a></h2><div class='prose'><p>${prose}</p></div></article>`,
  ).join('')}</div>`;

describe('page-purpose regression boundaries', () => {
  it.each(['currency', 'country', 'quantity', 'payment'])(
    'does not treat %s controls as product variants',
    (name) => {
      for (const [path, expected] of [
        ['/pricing', 'pricing'],
        ['/blog/review', 'article'],
      ]) {
        const { facts, result, rules } = inspect(
          `<main><h1>Page</h1><p>${prose}</p>
        <select name='${name}'><option>First</option><option>Second</option></select>
        <input type='radio' name='${name}' value='first'><input type='radio' name='${name}' value='second'>
        <a href='https://merchant.test/checkout'>Buy now</a></main>`,
          path!,
        );
        expect(facts.entity.product.has_variant_control).toBe(false);
        expect(result.assessment.page_kind).toBe(expected);
        expect(rules.get('aeo.product_answer_facts')!.outcome).toBe('not_applicable');
      }
    },
  );

  it('recognizes a variant from its associated label and retains real product classification', () => {
    const { facts, result } = inspect(
      `<main><h1>Shirt</h1><label for='choice'>Size</label>
      <select id='choice'><option>Small</option><option>Large</option></select><button>Add to cart</button></main>`,
      '/shirt',
    );
    expect(facts.entity.product.has_variant_control).toBe(true);
    expect(result.assessment.page_kind).toBe('product');
  });

  it.each([
    '/blog/page/2',
    '/en/blog/category/marketing',
    '/blog/tag/aeo/page/2',
    '/insights',
    '/resources',
    '/press',
  ])('keeps %s archives and featured excerpts out of article and commerce penalties', (path) => {
    const { facts, result, rules } = inspect(
      `<main><h1>Latest posts</h1>
        <article><h2><a href='/blog/featured'>Featured post</a></h2><p>${prose}</p></article>
        <section><p role='status'>9 results</p>${grid('story')}</section></main>`,
      path,
    );
    expect(result.assessment.page_kind).toBe('editorial_index');
    expect(facts.authored_content).toBe(false);
    expect(facts.primary_content_text).not.toContain(prose);
    for (const id of [
      'aeo.visible_attribution',
      'aeo.source_support_present',
      'aeo.content_date_present',
      'aeo.listing_item_facts',
    ])
      expect(createsIssue(rules.get(id)!), id).toBe(false);
  });

  it('excludes rich-text cards without stripping genuine article paragraphs with inline links', () => {
    const archive = inspect(`<main><h1>Posts</h1>${grid('post', 'prose')}</main>`, '/blog/page/2');
    expect(archive.facts.primary_content_text).not.toContain(prose);
    expect(archive.facts.authored_content).toBe(false);
    const article = inspect(
      `<main><h1>Research notes</h1><article><div class='prose'>${Array.from(
        { length: 3 },
        (_, index) =>
          `<p>${prose} According to <a href='https://source.test/${index}'>Source ${index}</a>.</p>`,
      ).join('')}</div></article></main>`,
      '/blog/research-notes',
    );
    expect(article.facts.primary_content_text).toContain(prose);
    expect(article.facts.authored_content).toBe(true);
    expect(article.rules.get('aeo.visible_attribution')!.outcome).toBe('missing');
  });

  it('does not infer authored content from a single featured excerpt on an unrecognized route', () => {
    const { facts, rules } = inspect(
      `<main><h1>Reading room</h1>
      <article><h2><a href='/blog/post'>Featured post</a></h2><p>${prose}</p></article></main>`,
      '/blog/reading-room',
    );
    expect(facts.authored_content).toBe(false);
    for (const id of [
      'aeo.visible_attribution',
      'aeo.source_support_present',
      'aeo.content_date_present',
    ]) {
      expect(rules.get(id)!.outcome).toBe('unknown');
      expect(createsIssue(rules.get(id)!)).toBe(false);
    }
  });

  it('reads item labels and targets from the bound collection without assuming product URL names', () => {
    const { facts, rules } = inspect(
      `<main><h1>Teapots</h1><section><p role='status'>9 results</p>${grid('minimalist-teapot')}</section></main>`,
      '/shop',
    );
    expect(rules.get('aeo.listing_answer_set')!.outcome).toBe('satisfied');
    const row = rules.get('aeo.listing_item_facts')!;
    expect(row.outcome).toBe('satisfied');
    expect(row.evidence.items).toContainEqual({
      title: 'Entry 0',
      url: 'https://example.test/minimalist-teapot-0',
    });
    const unnamed = inspect(
      `<main><h1>Teapots</h1><div class='collection-grid'>${Array.from(
        { length: 9 },
        (_, index) => `<div><a href='/item-${index}'><img src='/image.png' alt=''></a></div>`,
      ).join('')}</div></main>`,
      '/shop',
    );
    expect(unnamed.rules.get('aeo.listing_item_facts')!.outcome).toBe('missing');
    const legacy = analyzePage(
      {
        ...facts,
        entity: {
          ...facts.entity,
          listing: {
            ...facts.entity.listing,
            collection_evidence: { ...facts.entity.listing.collection_evidence, items: undefined },
          },
        },
      },
      { sitemapMember: false, siteFacts: null, auditTime: null },
    );
    expect(
      legacy.evaluations.find((row) => row.rule_id === 'aeo.listing_item_facts')!.outcome,
    ).toBe('unknown');
  });

  it.each(['Acme Inc.', 'Acme GmbH', 'Acme Private Limited'])(
    'matches company suffixes in %s without accepting another organization',
    (name) => {
      const schema = (organization: string) => `<head><title>Acme | Widgets for modern teams</title>
      <script type='application/ld+json'>${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: organization, url: 'https://example.test/' })}</script></head>
      <body><main><h1>Acme</h1></main></body>`;
      expect(inspect(schema(name), '/').rules.get('aeo.schema_matches_content')!.outcome).toBe(
        'satisfied',
      );
      expect(
        inspect(schema('Other Inc.'), '/').rules.get('aeo.schema_matches_content')!.outcome,
      ).toBe('missing');
    },
  );

  it('does not report missing inline answers on an FAQ index but still detects unanswered observed questions', () => {
    const index = inspect(
      `<main><h1>Help center</h1><ul><li><a href='/help/returns'>How do returns work?</a></li></ul></main>`,
      '/faq',
    );
    for (const id of ['aeo.answer_first', 'aeo.question_headings']) {
      expect(index.rules.get(id)!.outcome).toBe('unknown');
      expect(createsIssue(index.rules.get(id)!)).toBe(false);
    }
    const unanswered = inspect('<main><h1>FAQ</h1><h2>How do returns work?</h2></main>', '/faq');
    expect(unanswered.rules.get('aeo.answer_first')!.outcome).toBe('missing');
  });
});
