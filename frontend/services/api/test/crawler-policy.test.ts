import { expect, it } from 'vitest';
import catalog from '../src/config/crawlers.json' with { type: 'json' };
import { loadCrawlerCatalog, matchesCrawlerUserAgent } from '../src/config/crawlers.ts';
import { crawlerPolicyFacts } from '../src/web-evidence/acquisition.ts';
import { DELIVERY_CHECKS } from '../src/site-health/analysis/delivery-checks.ts';

const origin = 'https://example.test';
const bot = loadCrawlerCatalog(catalog).bots.find((value) => value.label === 'GPTBot')!;
it.each([
  [
    'allow exception',
    'User-agent: GPTBot\nDisallow: /\nAllow: /products/',
    'specific_group',
    'disallowed',
    'restricted',
    1,
  ],
  [
    'repeated groups',
    'User-agent: GPTBot\nDisallow: /$\nUser-agent: GPTBot\nDisallow: /products/',
    'specific_group',
    'disallowed',
    'all_disallowed',
    2,
  ],
  [
    'wildcard fallback',
    'User-agent: *\nDisallow: /products/',
    'wildcard_group',
    'allowed',
    'restricted',
    1,
  ],
  [
    'root only',
    'User-agent: GPTBot\nDisallow: /$',
    'specific_group',
    'disallowed',
    'restricted',
    1,
  ],
  [
    'fully overridden',
    'User-agent: GPTBot\nDisallow: /\nAllow: /',
    'specific_group',
    'allowed',
    'all_allowed',
    0,
  ],
  ['not specified', '', 'no_rules', 'allowed', 'all_allowed', 0],
])(
  'evaluates %s with the acquisition parser',
  (_name, body, matched, rootAccess, summary, denied) => {
    expect(
      crawlerPolicyFacts(origin, 200, body, [`${origin}/`, `${origin}/products/widget`], [bot])[0],
    ).toMatchObject({
      matched,
      root_access: rootAccess,
      policy: summary,
      evaluated_url_count: 2,
      disallowed_url_count: denied,
    });
  },
);
it.each([0, 401, 403, 429, 503])('keeps unreadable robots %s unknown', (status) => {
  expect(crawlerPolicyFacts(origin, status, '', [`${origin}/`], [bot])[0]).toMatchObject({
    root_access: 'unknown',
    policy: 'unknown',
    evaluated_url_count: 0,
    disallowed_url_count: 0,
  });
});
it.each([
  (value: typeof catalog) => value.bots.push({ ...value.bots[0]! }),
  (value: typeof catalog) => {
    value.bots[0]!.purpose = 'invented';
  },
  (value: typeof catalog) => {
    value.bots[0]!.ai_source = 'invented';
  },
  (value: typeof catalog) => {
    value.bots[0]!.checks = ['invented'];
  },
  (value: typeof catalog) => {
    value.resource_classes.push('invented');
  },
  (value: typeof catalog) => {
    value.resource_rules[0]!.resource_class = 'invented';
  },
])('rejects an invalid catalog', (mutate) => {
  const value = structuredClone(catalog);
  mutate(value);
  expect(() => loadCrawlerCatalog(value)).toThrow();
});
it('never identifies requests through robots-only tokens', () => {
  const bots = loadCrawlerCatalog(catalog).bots;
  for (const token of ['Google-Extended', 'Applebot-Extended']) {
    expect(bots.filter((value) => matchesCrawlerUserAgent(value, `${token}/1.0`))).toEqual([]);
  }
  expect(matchesCrawlerUserAgent(bot, 'Mozilla/5.0 (compatible; GPTBOT/1.4)')).toBe(true);
});
it('retains the root-access decision for training and search checks', () => {
  const bots = crawlerPolicyFacts(
    origin,
    200,
    'User-agent: GPTBot\nDisallow: /\nAllow: /products/',
    [`${origin}/`, `${origin}/products/widget`],
  );
  const facts = { site: { robots: { fetched: true, bots } } };
  expect(DELIVERY_CHECKS['technical.ai_crawler_access']!(facts)).toMatchObject([
    'missing',
    { blocked: ['GPTBot'] },
  ]);
  expect(DELIVERY_CHECKS['search.crawler_access']!(facts)[0]).toBe('satisfied');
});
