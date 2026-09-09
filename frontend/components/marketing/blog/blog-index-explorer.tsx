'use client';

import { ArrowRight, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  blogCategories,
  filterAndSortPosts,
  formatBlogDate,
  type BlogPostSummary,
  type BlogSort,
} from '@/lib/marketing-content/blog-index';
import { cn } from '@/lib/utils';

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'oldest', label: 'Oldest' },
] as const;

function CompactMeta({ post }: Readonly<{ post: BlogPostSummary }>) {
  const values = [post.author, post.date ? formatBlogDate(post.date) : null, post.readTime].filter(
    Boolean,
  );
  return <p className="website-label text-muted mt-4">{values.join(' · ')}</p>;
}

function ArticleCard({
  post,
  priority = false,
}: Readonly<{ post: BlogPostSummary; priority?: boolean }>) {
  return (
    <article className="border-border-subtle bg-panel hover:border-accent-border overflow-hidden rounded-[var(--radius-card)] border transition-colors">
      <div className="flex flex-col sm:flex-row">
        <Link
          href={`/blog/${post.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className="bg-panel-tonal relative aspect-[12/7] shrink-0 sm:w-[15rem] lg:w-[16rem]"
        >
          <Image
            src={post.image}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 640px) calc(100vw - 3rem), (max-width: 1024px) 240px, 256px"
            className="object-contain"
          />
        </Link>
        <div className="min-w-0 flex-1 p-5 sm:p-6">
          {post.tags[0] ? (
            <span className="bg-accent-soft text-accent-text inline-flex rounded-full px-3 py-1 text-xs font-medium">
              {post.tags[0]}
            </span>
          ) : null}
          <h2 className="website-feature-heading text-foreground mt-3">
            <Link
              href={`/blog/${post.slug}`}
              className="hover:text-accent-text focus-ring rounded-xs transition-colors"
            >
              {post.title}
            </Link>
          </h2>
          <p className="website-body text-muted mt-2 sm:line-clamp-2">{post.excerpt}</p>
          <CompactMeta post={post} />
          <Link
            href={`/blog/${post.slug}`}
            className="text-accent-text focus-ring mt-4 inline-flex items-center gap-2 rounded-xs text-sm font-medium"
          >
            Read article <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

function ReadingSidebar({ posts }: Readonly<{ posts: readonly BlogPostSummary[] }>) {
  const featured = posts[0];
  if (!featured) return null;
  return (
    <aside className="grid content-start gap-5" aria-label="Featured and recommended reading">
      <div className="border-border-subtle bg-panel rounded-[var(--radius-card)] border p-5">
        <p className="website-eyebrow text-accent-text">Featured</p>
        <h2 className="website-small-heading text-foreground mt-3">
          <Link
            href={`/blog/${featured.slug}`}
            className="hover:text-accent-text focus-ring rounded-xs transition-colors"
          >
            {featured.title}
          </Link>
        </h2>
        <p className="website-body text-muted mt-3 line-clamp-3">{featured.excerpt}</p>
        <Link
          href={`/blog/${featured.slug}`}
          className="text-accent-text focus-ring mt-4 inline-flex items-center gap-2 rounded-xs text-sm font-medium"
        >
          Read article <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {posts.length > 1 ? (
        <div className="border-border-subtle bg-panel rounded-[var(--radius-card)] border p-5">
          <p className="website-eyebrow text-muted">Recommended reading</p>
          <ol className="divide-border-subtle mt-2 divide-y">
            {posts.slice(1, 5).map((post) => (
              <li key={post.slug} className="py-4">
                <Link
                  href={`/blog/${post.slug}`}
                  className="text-foreground hover:text-accent-text focus-ring rounded-xs text-sm leading-snug font-medium transition-colors"
                >
                  {post.title}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </aside>
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
    <>
      <div className="border-border-subtle mb-6 flex flex-col gap-4 border-b pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Filter articles by category">
          {[null, ...categories].map((value) => (
            <Button
              key={value ?? 'all'}
              variant="secondary"
              size="sm"
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
              className={cn(
                'rounded-full',
                category === value && 'border-accent-border bg-accent-soft text-accent-text',
              )}
            >
              {value ?? 'All posts'}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3 self-end md:self-auto">
          <span id="blog-sort-label" className="website-label text-muted">
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
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-5" aria-live="polite">
          {visiblePosts.length ? (
            visiblePosts.map((post, index) => (
              <ArticleCard key={post.slug} post={post} priority={index === 0} />
            ))
          ) : (
            <div className="border-border-subtle bg-panel rounded-[var(--radius-card)] border border-dashed p-8 text-center">
              <h2 className="website-feature-heading text-foreground">
                No articles match this filter.
              </h2>
              <p className="website-body text-muted mt-2">Reset the category to see every guide.</p>
              <Button variant="secondary" className="mt-5" onClick={() => setCategory(null)}>
                <RotateCcw className="size-4" aria-hidden /> Reset filters
              </Button>
            </div>
          )}
        </div>
        <ReadingSidebar posts={posts} />
      </div>
    </>
  );
}
