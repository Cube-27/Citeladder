import type { BlogPost } from './blog';

export type BlogPostSummary = Pick<
  BlogPost,
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'image'
  | 'cardImage'
  | 'date'
  | 'dateModified'
  | 'readTime'
  | 'author'
  | 'tags'
>;

export function toBlogPostSummary(post: BlogPost): BlogPostSummary {
  const { slug, title, excerpt, image, cardImage, date, dateModified, readTime, author, tags } =
    post;
  return { slug, title, excerpt, image, cardImage, date, dateModified, readTime, author, tags };
}

/**
 * When a post last changed: its revision date, else its publication date.
 *
 * Reading only `date` made a listing page's freshness signal report when its
 * newest post was PUBLISHED, so revising an older post left the index looking
 * stale -- the opposite of what the signal exists to say.
 */
export function blogPostFreshness(post: BlogPostSummary): string | undefined {
  return post.dateModified ?? post.date;
}

/** Posts newest first; date ties keep their authored order and undated posts go last. */
export function newestFirst<T extends Pick<BlogPost, 'date'>>(posts: readonly T[]): T[] {
  return posts
    .map((post, originalIndex) => ({ post, originalIndex }))
    .sort((left, right) => {
      const leftTime = left.post.date ? Date.parse(left.post.date) : null;
      const rightTime = right.post.date ? Date.parse(right.post.date) : null;
      if (leftTime === null && rightTime !== null) return 1;
      if (leftTime !== null && rightTime === null) return -1;
      if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map(({ post }) => post);
}
