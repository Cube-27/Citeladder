import type { BlogPost } from '@/lib/marketing-content/blog';
import { formatSiteDate } from '@/lib/marketing-content/site-date';

import { FeatureCard } from '../sections/features';

export function postMeta(post: Pick<BlogPost, 'date' | 'readTime' | 'tags'>): string {
  return [post.date && formatSiteDate(post.date), post.readTime, post.tags[0]]
    .filter(Boolean)
    .join(' · ');
}

export function FeaturedPost({ post }: Readonly<{ post: BlogPost }>) {
  return (
    <div className="cl-featured-post">
      <FeatureCard
        href={`/blog/${post.slug}`}
        linkLabel="Read article"
        eyebrow={postMeta(post)}
        title={post.title}
        body={post.excerpt}
      />
    </div>
  );
}
