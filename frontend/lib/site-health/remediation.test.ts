import { describe, expect, it } from 'vitest';

import { contentHandoffHref, remediationRoute } from './remediation';

const HANDOFF = {
  projectId: '77777777-7777-4777-8777-777777777777',
  crawlId: '44444444-4444-4444-8444-444444444444',
  siteUrlId: 'cccccccc-1111-4111-8111-111111111111',
};

describe('remediationRoute', () => {
  it('falls back to the developer route for a value this client does not know', () => {
    expect(remediationRoute('content')).toBe('content');
    expect(remediationRoute('agent')).toBe('agent');
    expect(remediationRoute(undefined)).toBe('code');
    expect(remediationRoute('something_newer')).toBe('code');
  });
});

describe('contentHandoffHref', () => {
  it('names every carried check and omits the superseded analysis id', () => {
    const href = contentHandoffHref({
      ...HANDOFF,
      ruleIds: ['technical.title_present', 'aeo.content_date_present'],
    });
    expect(href).toContain('checkpoint_ids=technical.title_present');
    expect(href).toContain('checkpoint_ids=aeo.content_date_present');
    // Terminalization appends a new current analysis, so a revision id
    // captured when the link was rendered names a superseded row.
    expect(href).not.toContain('source_analysis_id');
  });

  it('returns no link when there is nothing a draft could act on', () => {
    expect(contentHandoffHref({ ...HANDOFF, ruleIds: [] })).toBeNull();
  });
});
