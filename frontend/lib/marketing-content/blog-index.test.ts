// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';

import { newestFirst } from './blog-index';

const post = (slug: string, date: string | undefined) => ({ slug, date });

describe('blog index ordering', () => {
  const posts = [
    post('tie-first', '2026-09-03'),
    post('older', '2026-08-01'),
    post('undated-first', undefined),
    post('tie-second', '2026-09-03'),
    post('undated-second', undefined),
  ] as const;

  it('puts the newest first, keeps date ties in order and undated posts last', () => {
    expect(newestFirst(posts).map((entry) => entry.slug)).toEqual([
      'tie-first',
      'tie-second',
      'older',
      'undated-first',
      'undated-second',
    ]);
  });

  it('does not mutate the source post order', () => {
    newestFirst(posts);
    expect(posts.map((entry) => entry.slug)).toEqual([
      'tie-first',
      'older',
      'undated-first',
      'tie-second',
      'undated-second',
    ]);
  });
});
