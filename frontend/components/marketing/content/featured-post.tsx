import type { BlogPost } from '@/lib/marketing-content/blog';
import { formatBlogDate } from '@/lib/marketing-content/blog-index';

import { FeatureCard } from '../sections/features';

/** A post's mono meta line: its date, read time and primary topic. */
export function postMeta(post: Pick<BlogPost, 'date' | 'readTime' | 'tags'>): string {
  return [post.date && formatBlogDate(post.date), post.readTime, post.tags[0]]
    .filter(Boolean)
    .join(' · ');
}

/** The blog index's newest post: a large linked FeatureCard, a tint panel of text alone (D38). */
export function FeaturedPost({ post }: Readonly<{ post: BlogPost }>) {
  return (
    <FeatureCard
      size="lg"
      href={`/blog/${post.slug}`}
      linkLabel="Read article"
      eyebrow={postMeta(post)}
      title={post.title}
      body={post.excerpt}
    />
  );
}
