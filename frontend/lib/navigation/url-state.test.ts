import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { optionalStringUrlCodec, setUrlParams, stringUrlCodec } from './url-state';

beforeEach(() => window.history.replaceState(null, '', '/projects'));

describe('URL state codecs', () => {
  it('canonicalizes invalid enums to the default and omits that default', () => {
    const codec = stringUrlCodec(['overview', 'issues'] as const, 'overview');
    expect(codec.parse('issues')).toBe('issues');
    expect(codec.parse('unknown')).toBe('overview');
    expect(codec.serialize('overview')).toBeNull();
    expect(codec.serialize('issues')).toBe('issues');
  });

  it('round-trips optional selected IDs', () => {
    expect(optionalStringUrlCodec.parse('issue-id')).toBe('issue-id');
    expect(optionalStringUrlCodec.serialize(null)).toBeNull();
  });

  it('preserves unrelated scope and hash while avoiding duplicate history entries', () => {
    window.history.replaceState(null, '', '/opportunities?project=project-id&keep=1#evidence');
    const push = vi.spyOn(window.history, 'pushState');

    setUrlParams({ selected: 'opportunity-id' });
    expect(window.location.href).toContain(
      '/opportunities?project=project-id&keep=1&selected=opportunity-id#evidence',
    );
    expect(push).toHaveBeenCalledOnce();

    setUrlParams({ selected: 'opportunity-id' });
    expect(push).toHaveBeenCalledOnce();
    push.mockRestore();
  });

  it('does not add history for an equivalent query encoding', () => {
    window.history.replaceState(null, '', '/opportunities?query=one%20two');
    const push = vi.spyOn(window.history, 'pushState');

    setUrlParams({ query: 'one two' });

    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });
});
