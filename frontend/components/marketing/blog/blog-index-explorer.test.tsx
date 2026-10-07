import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';

import type { BlogPostSummary } from '@/lib/marketing-content/blog-index';

import { BlogIndexExplorer } from './blog-index-explorer';

const post = (slug: string, date: string, topic: string): BlogPostSummary => ({
  slug,
  title: `Title ${slug}`,
  excerpt: `Excerpt ${slug}`,
  date,
  tags: [topic],
});

it('filters the archive by primary topic and links each row to its post', () => {
  render(
    <BlogIndexExplorer
      posts={[
        post('older', '2026-09-01', 'Citations'),
        post('newer', '2026-09-20', 'Website readiness'),
      ]}
    />,
  );
  const titles = () =>
    screen.getAllByRole('article').map((row) => row.querySelector('h2')?.textContent);
  expect(titles()).toEqual(['Title newer', 'Title older']);

  const filter = screen.getByRole('button', { name: 'Citations' });
  fireEvent.click(filter);
  expect(filter).toHaveAttribute('aria-pressed', 'true');
  expect(titles()).toEqual(['Title older']);
  const row = screen.getByRole('article');
  expect(within(row).getByRole('link', { name: 'Read article' })).toHaveAttribute(
    'href',
    '/blog/older',
  );

  fireEvent.click(screen.getByRole('button', { name: 'All posts' }));
  expect(titles()).toHaveLength(2);
});
