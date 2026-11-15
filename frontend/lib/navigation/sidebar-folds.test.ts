import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { isGroupFolded, setGroupFolded } from './sidebar-folds';

afterEach(() => {
  vi.restoreAllMocks();
  setGroupFolded('analyze', false);
  setGroupFolded('track', false);
  window.localStorage.clear();
});

describe('sidebar group folds', () => {
  it('keeps each group fold in local storage, independently', () => {
    setGroupFolded('analyze', true);
    expect(isGroupFolded('analyze')).toBe(true);
    expect(isGroupFolded('track')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('citeladder:app:sidebar-folds') ?? '')).toEqual([
      'analyze',
    ]);
    setGroupFolded('analyze', false);
    expect(isGroupFolded('analyze')).toBe(false);
  });

  it('reads a fold another load wrote and ignores a corrupt value', () => {
    window.localStorage.setItem('citeladder:app:sidebar-folds', '["track"]');
    expect(isGroupFolded('track')).toBe(true);
    window.localStorage.setItem('citeladder:app:sidebar-folds', '{not json');
    expect(isGroupFolded('track')).toBe(false);
  });

  it('keeps a fold for the session when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setGroupFolded('track', true);
    expect(isGroupFolded('track')).toBe(true);
    expect(isGroupFolded('analyze')).toBe(false);
  });
});
