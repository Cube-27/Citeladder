import type { BlogPost } from '@/lib/marketing-content/blog';
import { formatSiteDate } from '@/lib/marketing-content/site-date';

import { FeatureCard } from '../sections/features';

/** A post's mono meta line: its date, read time and primary topic. */
export function postMeta(post: Pick<BlogPost, 'date' | 'readTime' | 'tags'>): string {
  return [post.date && formatSiteDate(post.date), post.readTime, post.tags[0]]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The blog index's newest post: a large linked FeatureCard, a tint panel of
 * text alone; from 1024px its title and excerpt fill the left 7/12 and
 * the meta line and read link the right 5/12 (features.css).
 */
export function FeaturedPost({ post }: Readonly<{ post: BlogPost }>) {
  return (
    <div className="cl-featured-post">
      <FeatureCard
        size="lg"
        href={`/blog/${post.slug}`}
        linkLabel="Read article"
        eyebrow={postMeta(post)}
        title={post.title}
        body={post.excerpt}
      />
    </div>
  );
}
