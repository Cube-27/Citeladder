import { ArrowRight } from 'lucide-react';

import type { ReactNode } from 'react';

import { PostMeta } from '@/components/marketing/blog/blog-index-explorer';
import {
  BLOG_EMPTY_STATE,
  BLOG_START_PATHS,
  POSTS,
  type BlogPost,
} from '@/lib/marketing-content/blog';
import {
  filterAndSortPosts,
  formatBlogDate,
  toBlogPostSummary,
} from '@/lib/marketing-content/blog-index';
import { DEMO_CTA } from '@/lib/marketing-content/nav';
import { blogPostingJsonLd } from '@/lib/seo/json-ld';

import { blockIdentity, headingId, PostBlock, withOccurrenceKeys } from '../blog/post-blocks';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { LinkedInMark } from '../primitives/linkedin-mark';
import { PageHero } from '../primitives/page-hero';
import { Container, Section, SectionHeader } from '../primitives/section';
import { JsonLd } from '../seo/json-ld';

/**
 * `/blog` and `/blog/[slug]`.
 */

type ResearchGuide = { title: string; href: string; description: string };

function postHeadings(post: BlogPost) {
  return post.body.filter(
    (block): block is { type: 'heading'; text: string } => block.type === 'heading',
  );
}

function BlogCta({
  title,
  body = 'Measure AI visibility with evidence your team can inspect.',
  secondary,
}: Readonly<{ title: string; body?: string; secondary: { href: string; label: string } }>) {
  return (
    <Section className="marketing-closing-band" aria-label="Get started">
      <div className="flex flex-col items-center gap-9">
        <SectionHeader title={title} lead={body} align="center" />
        <div className="flex flex-wrap justify-center gap-3">
          <DemoButtonLink>
            {DEMO_CTA}
            <ArrowRight aria-hidden />
          </DemoButtonLink>
          <ButtonLink href={secondary.href} variant="soft">
            {secondary.label}
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}

/**
 * The newest post, set as a typographic cover. The posts carry no
 * photography, so the second column shows what the article actually covers:
 * its section outline, each line a link into the post.
 */
function FeaturedPost({ post }: Readonly<{ post: BlogPost }>) {
  const outline = postHeadings(post).slice(0, 5);
  const href = `/blog/${post.slug}`;
  return (
    <Section rhythm="tight" className="pt-0" aria-label="Featured article">
      <article className="cp-feature">
        <div className="cp-feature-copy">
          {post.tags[0] && <span className="cp-chip">{post.tags[0]}</span>}
          <h2 className="website-section-heading cp-feature-title">
            <a href={href} className="cp-title-link focus-ring rounded-xs">
              {post.title}
            </a>
          </h2>
          <p className="website-lead max-w-[56ch]">{post.excerpt}</p>
          <PostMeta post={toBlogPostSummary(post)} />
          <a href={href} className="mk-text-link focus-ring rounded-xs">
            Read article
            <ArrowRight aria-hidden className="size-4" />
          </a>
        </div>
        {outline.length > 0 && (
          <nav className="cp-feature-outline" aria-label={`Sections in ${post.title}`}>
            <p className="website-label">In this article</p>
            <ol>
              {withOccurrenceKeys(outline, (block) => block.text).map(({ key, value }) => (
                <li key={key}>
                  <a href={`${href}#${headingId(value.text)}`} className="focus-ring">
                    {value.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </article>
    </Section>
  );
}

function StartPaths() {
  return (
    <Section tone="soft" aria-labelledby="blog-start-title">
      <div className="mk-split">
        <SectionHeader
          headingId="blog-start-title"
          title="Start with the question you have."
          lead="Three guides cover the questions most teams ask first."
        />
        <ul className="cp-link-list">
          {BLOG_START_PATHS.map((path) => (
            <li key={path.slug}>
              <a href={`/blog/${path.slug}`} className="cp-link-row focus-ring">
                <span className="cp-link-title">{path.heading}</span>
                <span className="cp-link-desc">{path.body}</span>
                <ArrowRight aria-hidden className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function ResearchGuides({ guides }: Readonly<{ guides: readonly ResearchGuide[] }>) {
  return (
    <Section aria-labelledby="blog-research-title">
      <SectionHeader
        headingId="blog-research-title"
        title="Research guides"
        lead="Long-form references on measuring AI visibility and tracking citations, each with its sources."
      />
      <ul className="cp-link-list cp-link-list-2">
        {guides.map((guide) => (
          <li key={guide.href}>
            <a href={guide.href} className="cp-link-row focus-ring">
              <span className="cp-link-title">{guide.title}</span>
              <span className="cp-link-desc line-clamp-2">{guide.description}</span>
              <ArrowRight aria-hidden className="size-4" />
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function EmptyBlog() {
  return (
    <Section aria-label="No posts yet">
      <div className="cp-empty">
        <h2 className="website-section-heading">{BLOG_EMPTY_STATE.heading}</h2>
        <p className="website-body max-w-[48ch]">{BLOG_EMPTY_STATE.body}</p>
      </div>
    </Section>
  );
}

/** Server-rendered; `explorer` is the hydrated filter and sort list (`BlogIndexExplorer`). */
export function BlogIndex({
  researchGuides = [],
  explorer,
}: Readonly<{ researchGuides?: readonly ResearchGuide[]; explorer?: ReactNode }>) {
  const summaries = POSTS.map(toBlogPostSummary);
  const newest = filterAndSortPosts(summaries, null, 'latest')[0];
  const featured = POSTS.find((post) => post.slug === newest?.slug);
  return (
    <>
      <PageHero
        title="Practical guides to AI visibility."
        lead="How to build a baseline, trace the sources behind an answer and check that your website can be read. Start with the question your team is asking."
      />

      {featured && <FeaturedPost post={featured} />}

      {summaries.length ? (
        <Section rhythm="tight" aria-label="Blog articles">
          {explorer}
        </Section>
      ) : (
        <EmptyBlog />
      )}

      <StartPaths />

      {researchGuides.length > 0 && <ResearchGuides guides={researchGuides} />}

      <BlogCta
        title="Put the method into practice."
        body="See how CiteLadder brings answer observations, source analysis and website findings into one workflow."
        secondary={{ href: '/compare', label: 'Compare AI visibility tools' }}
      />
    </>
  );
}

function AuthorName({ post }: Readonly<{ post: BlogPost }>) {
  if (!post.author) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="cp-meta-strong">{post.author}</span>
      {post.authorUrl ? (
        <a
          href={post.authorUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`${post.author} on LinkedIn`}
          className="text-muted hover:text-accent-text focus-ring inline-flex rounded-xs"
        >
          <LinkedInMark />
        </a>
      ) : null}
    </span>
  );
}

function PostHeader({ post }: Readonly<{ post: BlogPost }>) {
  const updated = post.dateModified && post.dateModified !== post.date ? post.dateModified : null;
  const hasByline = Boolean(post.author || post.date || post.readTime);
  return (
    <header className="cp-article-head">
      <nav aria-label="Breadcrumb" className="cp-crumbs">
        <ol>
          <li>
            <a href="/" className="focus-ring rounded-xs">
              Home
            </a>
          </li>
          <li>
            <a href="/blog" className="focus-ring rounded-xs">
              Blog
            </a>
          </li>
        </ol>
      </nav>
      <h1 className="website-page-title website-article-title">{post.title}</h1>
      <p className="website-lead max-w-[62ch]">{post.excerpt}</p>
      {post.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Topics">
          {post.tags.map((tag) => (
            <li key={tag} className="cp-chip">
              {tag}
            </li>
          ))}
        </ul>
      )}
      {hasByline && (
        <p className="cp-meta cp-byline">
          {post.author && <AuthorName post={post} />}
          {post.date && (
            <span>
              Published <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
            </span>
          )}
          {updated && (
            <span>
              Updated <time dateTime={updated}>{formatBlogDate(updated)}</time>
            </span>
          )}
          {post.readTime && <span>{post.readTime}</span>}
        </p>
      )}
      {post.editorialNote && <p className="website-label max-w-[68ch]">{post.editorialNote}</p>}
    </header>
  );
}

/**
 * The companion rail: contents, then the author. Sticky beside the article
 * from `lg` up; below that the contents sit above the article and the author
 * block is dropped, because the byline already names them.
 *
 * A post with no headings gets no contents list rather than an empty box.
 */
function PostAside({ post }: Readonly<{ post: BlogPost }>) {
  const headings = postHeadings(post);
  return (
    <aside>
      {headings.length > 0 && (
        <nav aria-label="On this page" className="cp-toc">
          <p className="website-label">On this page</p>
          <ol>
            {withOccurrenceKeys(headings, (block) => block.text).map(({ key, value }) => (
              <li key={key}>
                <a href={`#${headingId(value.text)}`} className="focus-ring">
                  {value.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {post.author && (
        <div className="cp-author">
          <p className="website-label">Written by</p>
          <p className="website-body">
            <AuthorName post={post} />
          </p>
          {post.authorRole && <p className="website-label">{post.authorRole}</p>}
        </div>
      )}
    </aside>
  );
}

function Sources({ post }: Readonly<{ post: BlogPost }>) {
  if (!post.sources.length) return null;
  return (
    <section aria-labelledby="article-sources" className="grid gap-4">
      <h2 id="article-sources" className="website-feature-heading">
        Sources
      </h2>
      <ol className="cp-sources">
        {post.sources.map((source) => (
          <li key={source.id}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
            {', '}
            {source.publisher}
            {source.publishedDate ? ` (${formatBlogDate(source.publishedDate)})` : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function RelatedReading({ post }: Readonly<{ post: BlogPost }>) {
  const related = post.relatedSlugs
    .map((slug) => POSTS.find((candidate) => candidate.slug === slug))
    .filter((candidate): candidate is BlogPost => Boolean(candidate));
  if (!related.length) return null;
  return (
    <section aria-labelledby="related-reading" className="grid gap-5">
      <h2 id="related-reading" className="website-feature-heading">
        Related reading
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {related.map((relatedPost) => (
          <li key={relatedPost.slug}>
            <a href={`/blog/${relatedPost.slug}`} className="mk-related-card focus-ring">
              {relatedPost.tags[0] && <span className="cp-chip mb-2">{relatedPost.tags[0]}</span>}
              <span className="cp-link-title pr-6">{relatedPost.title}</span>
              <span className="cp-link-desc line-clamp-3">{relatedPost.excerpt}</span>
              <ArrowRight aria-hidden className="mk-related-arrow size-4" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pager({ post }: Readonly<{ post: BlogPost }>) {
  const postIndex = POSTS.findIndex((candidate) => candidate.slug === post.slug);
  const previous = postIndex > 0 ? POSTS[postIndex - 1] : undefined;
  const next = postIndex >= 0 ? POSTS[postIndex + 1] : undefined;
  if (!previous && !next) return null;
  return (
    <nav aria-label="Previous and next articles" className="cp-pager">
      {previous && (
        <a href={`/blog/${previous.slug}`} className="focus-ring">
          <span className="website-label">Previous</span>
          <span className="cp-link-title">{previous.title}</span>
        </a>
      )}
      {next && (
        <a href={`/blog/${next.slug}`} className="cp-pager-next focus-ring">
          <span className="website-label">Next</span>
          <span className="cp-link-title">{next.title}</span>
        </a>
      )}
    </nav>
  );
}

export function BlogPostView({ post }: Readonly<{ post: BlogPost }>) {
  return (
    <>
      <JsonLd
        data={{
          ...blogPostingJsonLd(post),
          articleSection: post.tags,
          keywords: post.tags,
        }}
      />
      <Container>
        <div className="cp-article">
          <PostHeader post={post} />
          <div className="cp-article-grid">
            <PostAside post={post} />
            <article aria-label="Post content" className="cp-prose">
              {withOccurrenceKeys(post.body, blockIdentity).map(({ key, value }) => (
                <PostBlock key={key} block={value} sources={post.sources} />
              ))}
              <div className="cp-article-end">
                <Sources post={post} />
                <RelatedReading post={post} />
                <Pager post={post} />
              </div>
            </article>
          </div>
        </div>
      </Container>

      <BlogCta
        title={post.closing?.heading ?? 'Make AI visibility measurable.'}
        body={post.closing?.body}
        secondary={post.closing?.secondary ?? { href: '/blog', label: 'All guides' }}
      />
    </>
  );
}
