'use client';

import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Select } from '@/components/ui/select';
import {
  blogCategories,
  filterAndSortPosts,
  formatBlogDate,
  type BlogPostSummary,
  type BlogSort,
} from '@/lib/marketing-content/blog-index';

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'oldest', label: 'Oldest' },
] as const;

/** Author, date and reading time, each only when the post supplies it. */
export function PostMeta({ post }: Readonly<{ post: BlogPostSummary }>) {
  if (!(post.author || post.date || post.readTime)) return null;
  return (
    <p className="cp-meta">
      {post.author && <span className="cp-meta-strong">{post.author}</span>}
      {post.date && <time dateTime={post.date}>{formatBlogDate(post.date)}</time>}
      {post.readTime && <span>{post.readTime}</span>}
    </p>
  );
}

/**
 * One archive row: date, then the title and excerpt, then the topic and the
 * way in. The posts' illustrations are deliberately not shown here; the row is
 * typographic so the list scans like an index.
 */
function ArticleRow({ post }: Readonly<{ post: BlogPostSummary }>) {
  const href = `/blog/${post.slug}`;
  return (
    <article>
      <p className="cp-row-date">
        {post.date ? <time dateTime={post.date}>{formatBlogDate(post.date)}</time> : null}
      </p>
      <div className="cp-row-main">
        <h2 className="website-feature-heading">
          <a href={href} className="cp-title-link focus-ring rounded-xs">
            {post.title}
          </a>
        </h2>
        <p className="website-body text-muted md:line-clamp-2">{post.excerpt}</p>
        {(post.author || post.readTime) && (
          <p className="cp-meta">
            {post.author && <span>{post.author}</span>}
            {post.readTime && <span>{post.readTime}</span>}
          </p>
        )}
      </div>
      <div className="cp-row-side">
        {post.tags[0] && <span className="cp-chip">{post.tags[0]}</span>}
        <a href={href} className="mk-text-link focus-ring rounded-xs">
          Read article
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
    </article>
  );
}

export function BlogIndexExplorer({ posts }: Readonly<{ posts: readonly BlogPostSummary[] }>) {
  const categories = blogCategories(posts);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<BlogSort>('latest');
  const visiblePosts = useMemo(
    () => filterAndSortPosts(posts, category, sort),
    [posts, category, sort],
  );

  return (
    <div className="grid gap-2">
      <div className="cp-toolbar">
        <fieldset className="flex min-w-0 flex-wrap gap-2">
          <legend className="sr-only">Filter articles by category</legend>
          {[null, ...categories].map((value) => (
            <button
              key={value ?? 'all'}
              type="button"
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
              className="cp-filter focus-ring"
            >
              {value ?? 'All posts'}
            </button>
          ))}
        </fieldset>
        <div className="flex items-center gap-3 self-end md:self-auto">
          <span id="blog-sort-label" className="website-label">
            Sort
          </span>
          <Select
            value={sort}
            onValueChange={setSort}
            options={SORT_OPTIONS}
            ariaLabel="Sort blog posts"
            aria-labelledby="blog-sort-label"
            className="w-32"
          />
        </div>
      </div>
      <div className="cp-rows" aria-live="polite">
        {visiblePosts.length ? (
          visiblePosts.map((post) => <ArticleRow key={post.slug} post={post} />)
        ) : (
          <div className="cp-empty">
            <h2 className="website-feature-heading">No articles match this filter.</h2>
            <p className="website-body text-muted">Show every topic to see all guides.</p>
            <button
              type="button"
              className="cp-filter focus-ring"
              onClick={() => setCategory(null)}
            >
              Show all posts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
