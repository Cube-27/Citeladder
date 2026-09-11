import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogPostView } from '@/components/marketing/pages/blog';
import { JsonLd } from '@/components/marketing/seo/json-ld';
import { POSTS } from '@/lib/marketing-content/blog';
import { breadcrumbJsonLd } from '@/lib/seo/json-ld';
import { absoluteUrl } from '@/lib/seo/site';

/**
 * Public marketing blog post template (`/blog/[slug]`). Statically generated
 * from the typed posts array in lib/marketing-content/blog (single import
 * site); unknown slugs 404.
 *
 * This route is the ONE allowed exception to the marketing sync-RSC rule:
 * Next 16 hands `params` to the page as a Promise, so the default export is a
 * thin async wrapper that awaits it and delegates all rendering to the sync
 * BlogPostView (which the page test renders directly under Testing Library).
 */

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ slug: string }>;
}>): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find((candidate) => candidate.slug === slug);
  if (!post) return {};
  const title = post.seoTitle;
  const image = absoluteUrl(post.image);
  return {
    title,
    description: post.seoDescription,
    keywords: [...post.tags, 'AI visibility', 'AEO'],
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title,
      description: post.seoDescription,
      type: 'article',
      siteName: 'CiteLadder',
      publishedTime: post.date,
      modifiedTime: post.dateModified ?? post.date,
      authors: post.author ? [post.author] : undefined,
      tags: [...post.tags],
      images: image ? [{ url: image, width: 1080, height: 630, alt: '' }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: post.seoDescription,
      images: image ? [image] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: Readonly<{
  params: Promise<{ slug: string }>;
}>) {
  const { slug } = await params;
  const post = POSTS.find((candidate) => candidate.slug === slug);
  if (!post) notFound();
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: post.title, path: `/blog/${post.slug}` },
  ]);
  return (
    <main id="main">
      {breadcrumb ? <JsonLd id="blog-post-breadcrumb-json-ld" data={breadcrumb} /> : null}
      <BlogPostView post={post} />
    </main>
  );
}
