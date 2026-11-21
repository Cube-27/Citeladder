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

export function blogPostFreshness(post: BlogPostSummary): string | undefined {
  return post.dateModified ?? post.date;
}

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
