// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { BlogPostSummary } from './blog-index';
import { blogCategories, filterAndSortPosts } from './blog-index';

const summary = (slug: string, date: string | undefined, category: string): BlogPostSummary => ({
  slug,
  title: slug,
  excerpt: `${slug} excerpt`,
  image: `/${slug}.webp`,
  date,
  tags: [category],
});

describe('blog index explorer logic', () => {
  const posts = [
    summary('tie-first', '2026-09-03', 'Audit'),
    summary('older', '2026-08-01', 'Playbook'),
    summary('tie-second', '2026-09-03', 'Audit'),
    summary('undated-first', undefined, 'Notes'),
    summary('undated-second', undefined, 'Notes'),
  ] as const;

  it('derives categories from first tags in source order', () => {
    expect(blogCategories(posts)).toEqual(['Audit', 'Playbook', 'Notes']);
  });

  it('filters by the primary category and resets with a null category', () => {
    expect(filterAndSortPosts(posts, 'Audit', 'latest').map((post) => post.slug)).toEqual([
      'tie-first',
      'tie-second',
    ]);
    expect(filterAndSortPosts(posts, null, 'latest')).toHaveLength(posts.length);
  });

  it('sorts latest and oldest while preserving date ties', () => {
    expect(filterAndSortPosts(posts, null, 'latest').map((post) => post.slug)).toEqual([
      'tie-first',
      'tie-second',
      'older',
      'undated-first',
      'undated-second',
    ]);
    expect(filterAndSortPosts(posts, null, 'oldest').map((post) => post.slug)).toEqual([
      'older',
      'tie-first',
      'tie-second',
      'undated-first',
      'undated-second',
    ]);
  });

  it('does not mutate the source post order', () => {
    const before = posts.map((post) => post.slug);
    filterAndSortPosts(posts, null, 'oldest');
    expect(posts.map((post) => post.slug)).toEqual(before);
  });
});
