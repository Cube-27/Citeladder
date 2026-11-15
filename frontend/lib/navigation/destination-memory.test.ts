import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { rememberDestinationRoute, rememberedDestinationRoute } from './destination-memory';

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('destination and mode memory', () => {
  it('returns the last route per destination and project', () => {
    rememberDestinationRoute('mode:agent', 'p1', '/agent/chats/c1');
    rememberDestinationRoute('mode:agent', 'p2', '/agent/skills');
    rememberDestinationRoute('/site', 'p1', '/site?tab=pages');
    expect(rememberedDestinationRoute('mode:agent', 'p1')).toBe('/agent/chats/c1');
    expect(rememberedDestinationRoute('mode:agent', 'p2')).toBe('/agent/skills');
    expect(rememberedDestinationRoute('mode:dashboard', 'p1')).toBeNull();
    expect(rememberedDestinationRoute('/site', 'p1')).toBe('/site?tab=pages');
    expect(rememberedDestinationRoute('mode:agent', null)).toBeNull();
  });

  it('ignores a stored route that leaves the app', () => {
    window.sessionStorage.setItem(
      'citeladder:destination-routes',
      JSON.stringify({ 'p1:mode:agent': '//evil.example/x', 'p1:/site': '/site' }),
    );
    expect(rememberedDestinationRoute('mode:agent', 'p1')).toBeNull();
    expect(rememberedDestinationRoute('/site', 'p1')).toBe('/site');
  });

  it('falls back to the home route when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    rememberDestinationRoute('mode:agent', 'p1', '/agent/chats/c1');
    expect(rememberedDestinationRoute('mode:agent', 'p1')).toBeNull();
  });
});
