import type { BlogPost } from './blog';

export type BlogPostSummary = Pick<
  BlogPost,
  'slug' | 'title' | 'excerpt' | 'image' | 'date' | 'readTime' | 'author' | 'tags'
>;

export type BlogSort = 'latest' | 'oldest';

export function toBlogPostSummary(post: BlogPost): BlogPostSummary {
  const { slug, title, excerpt, image, date, readTime, author, tags } = post;
  return { slug, title, excerpt, image, date, readTime, author, tags };
}

export function blogCategories(posts: readonly BlogPostSummary[]): string[] {
  return [...new Set(posts.flatMap((post) => post.tags[0] ?? []))];
}

export function filterAndSortPosts(
  posts: readonly BlogPostSummary[],
  category: string | null,
  sort: BlogSort,
): BlogPostSummary[] {
  return posts
    .map((post, originalIndex) => ({ post, originalIndex }))
    .filter(({ post }) => !category || post.tags[0] === category)
    .sort((left, right) => {
      const leftTime = left.post.date ? Date.parse(left.post.date) : null;
      const rightTime = right.post.date ? Date.parse(right.post.date) : null;
      if (leftTime === null && rightTime !== null) return 1;
      if (leftTime !== null && rightTime === null) return -1;
      if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
        return sort === 'latest' ? rightTime - leftTime : leftTime - rightTime;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map(({ post }) => post);
}

const blogDateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatBlogDate(date: string): string {
  return blogDateFormat.format(new Date(date));
}
