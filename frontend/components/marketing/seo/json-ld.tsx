import type { BlogPost } from '@/lib/marketing-content/blog';
import type { FaqGroup } from '@/lib/marketing-content/faq';
import { absoluteUrl, SITE_NAME, SITE_TAGLINE } from '@/lib/seo/site';

/**
 * JSON-LD for the public marketing surface. The helpers build plain typed
 * objects from module constants — no user input reaches the serializer — and
 * `JsonLd` is the one sync server component that renders the script tag.
 *
 * The Organization block is omitted entirely while no canonical origin exists
 * (B3): an Organization without `url` is not worth emitting. FAQPage and
 * BlogPosting stay valid in that state. BlogPosting emits `datePublished` and
 * `author` only once the owner supplies them (B5).
 */

type JsonLdObject = Record<string, unknown>;

export function organizationJsonLd(): JsonLdObject | null {
  const url = absoluteUrl('/');
  if (!url) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    description: SITE_TAGLINE,
    url,
  };
}

export function faqPageJsonLd(groups: readonly FaqGroup[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: groups.flatMap((group) =>
      group.items.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    ),
  };
}

export function blogPostingJsonLd(post: BlogPost): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    // Owner-supplied byline fields (B5) — absent keys are omitted, not guessed.
    ...(post.date ? { datePublished: post.date } : {}),
    ...(post.author ? { author: { '@type': 'Person', name: post.author } } : {}),
  };
}

export function JsonLd({ data }: Readonly<{ data: JsonLdObject }>) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
