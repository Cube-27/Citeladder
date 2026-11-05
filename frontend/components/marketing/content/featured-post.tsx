import type { JSX } from 'react';

import type { BlogPost } from '@/lib/marketing-content/blog';
import { formatBlogDate } from '@/lib/marketing-content/blog-index';

import { ProductFrame } from '../screens/product-frame';
import { ScreenSiteHealth } from '../screens/screens-site';
import { ScreenPrompts } from '../screens/screens-visibility';
import { FeatureCard } from '../sections/features';

/** The product screen a post is about, where it has one. */
const POST_SCREENS: Readonly<Record<string, { label: string; screen: () => JSX.Element }>> = {
  'ai-search-buyer-prompt-generation': { label: 'Tracked prompts', screen: ScreenPrompts },
  'jev-internal-linking-citeladder': { label: 'Site Health', screen: ScreenSiteHealth },
};

/** A post's mono meta line: its date, read time and primary topic. */
export function postMeta(post: Pick<BlogPost, 'date' | 'readTime' | 'tags'>): string {
  return [post.date && formatBlogDate(post.date), post.readTime, post.tags[0]]
    .filter(Boolean)
    .join(' · ');
}

/** The blog index's newest post: a large FeatureCard with the product screen it covers. */
export function FeaturedPost({ post }: Readonly<{ post: BlogPost }>) {
  const shot = POST_SCREENS[post.slug];
  return (
    <FeatureCard
      size="lg"
      href={`/blog/${post.slug}`}
      linkLabel="Read article"
      eyebrow={postMeta(post)}
      title={post.title}
      body={post.excerpt}
      media={
        shot ? (
          <ProductFrame label={shot.label}>
            <shot.screen />
          </ProductFrame>
        ) : undefined
      }
    />
  );
}
