import { expect, it } from 'vite-plus/test';
import { makeSiteFacts } from '@/test/fixtures/site-health';
import { readSiteFacts } from './site-facts';
import { robotsLineDiff } from './robots-diff';

it('renders only the persisted catalog projection and rejects incomplete evidence', () => {
  const facts = makeSiteFacts();
  expect(readSiteFacts(facts)?.robots.bots[0]).toMatchObject({
    label: 'GPTBot',
    root_access: 'disallowed',
  });
  expect(readSiteFacts({ ...facts, robots: { fetched: true } })).toBeNull();
  expect(readSiteFacts(null)).toBeNull();
});
it('diffs retained lines with stable prefix and suffix context', () => {
  expect(
    robotsLineDiff('User-agent: *\r\nDisallow: /\r\n# end', 'User-agent: *\nAllow: /\n# end'),
  ).toBe('  User-agent: *\n- Disallow: /\n+ Allow: /\n  # end');
});
