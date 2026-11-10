import { describe, expect, it } from 'vite-plus/test';

import { occurrence } from '@/components/site-health/issues-catalog.test-support';
import { groupOccurrences } from './occurrence-groups';

const REDIRECT_RULE = 'technical.internal_link_redirect';

function onPage(index: number, evidence: Record<string, unknown>) {
  return occurrence({
    rule_id: REDIRECT_RULE,
    occurrence_id: `dddddddd-${String(index).padStart(4, '0')}-4111-8111-111111111111`,
    site_url_id: `cccccccc-${String(index).padStart(4, '0')}-4111-8111-111111111111`,
    normalized_url: `https://acme.com/page-${index}`,
    display_url: `https://acme.com/page-${index}`,
    evidence,
  });
}

describe('groupOccurrences', () => {
  it('shares a template link that lands in the same place from every page', () => {
    const evidence = {
      failing_targets: [{ url: 'https://acme.com/old', final_url: 'https://acme.com/new' }],
    };
    const entries = groupOccurrences([onPage(1, evidence), onPage(2, evidence)]);
    expect(entries.map((entry) => entry.kind)).toEqual(['shared']);
    expect(entries[0]?.kind === 'shared' && entries[0].facts).toEqual(['/old → /new']);
  });

  it('never shares a line that names the page it is printed under', () => {
    // Each page links to itself through a redirect: the same words, "→ this
    // page", but a different page every time.
    const entries = groupOccurrences([
      onPage(1, {
        failing_targets: [{ url: 'https://acme.com/p1', final_url: 'https://acme.com/page-1' }],
      }),
      onPage(2, {
        failing_targets: [{ url: 'https://acme.com/p1', final_url: 'https://acme.com/page-2' }],
      }),
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(['page', 'page']);
  });
});
