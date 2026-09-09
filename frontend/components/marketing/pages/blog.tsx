import { ArrowLeft, ArrowRight, PenLine } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { BlogIndexExplorer } from '@/components/marketing/blog/blog-index-explorer';
import { BLOG_EMPTY_STATE, POSTS, type BlogPost } from '@/lib/marketing-content/blog';
import { formatBlogDate, toBlogPostSummary } from '@/lib/marketing-content/blog-index';
import { DEMO_CTA } from '@/lib/marketing-content/nav';
import { blogPostingJsonLd } from '@/lib/seo/json-ld';
import { cn } from '@/lib/utils';

import { blockIdentity, headingId, PostBlock, withOccurrenceKeys } from '../blog/post-blocks';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { Meta } from '../primitives/label';
import { LinkedInMark } from '../primitives/linkedin-mark';
import { Reveal } from '../primitives/reveal';
import { Container, Section } from '../primitives/section';
import { JsonLd } from '../seo/json-ld';

/**
 * `/blog` and `/blog/[slug]`.
 */
function TagRow({ tags, className }: Readonly<{ tags: readonly string[]; className?: string }>) {
  if (tags.length === 0) return null;
  return (
    <div className={cn('mb-4 flex flex-wrap gap-2', className)}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="bg-accent-soft text-accent-text rounded-full px-3 py-1 text-xs font-medium"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function AuthorByline({ name, href }: Readonly<{ name: string; href?: string }>) {
  const mark = href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${name} on LinkedIn`}
      className="text-muted hover:text-accent-text inline-flex"
    >
      <LinkedInMark />
    </a>
  ) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      BY : <span className="text-foreground">{name}</span>
      {mark}
    </span>
  );
}

function PostByline({
  post,
  linkedin = false,
  className,
}: Readonly<{ post: BlogPost; linkedin?: boolean; className?: string }>) {
  if (!(post.author || post.date || post.readTime)) return null;
  const updated = post.dateModified && post.dateModified !== post.date ? post.dateModified : null;
  const items = [
    post.author ? (
      <AuthorByline key="author" name={post.author} href={linkedin ? post.authorUrl : undefined} />
    ) : null,
    post.date ? <span key="date">PUBLISHED : {formatBlogDate(post.date)}</span> : null,
    updated ? <span key="updated">UPDATED : {formatBlogDate(updated)}</span> : null,
    post.readTime ? <span key="read">READING TIME : {post.readTime}</span> : null,
  ].filter(Boolean);
  return (
    <p
      className={cn(
        'website-label text-muted mt-3 flex flex-wrap items-center gap-x-2 gap-y-1',
        className,
      )}
    >
      {items.map((item, index) => (
        <span key={index} className="contents">
          {index > 0 ? <span aria-hidden>,</span> : null}
          {item}
        </span>
      ))}
    </p>
  );
}

function BlogCta({
  title,
  secondary,
}: Readonly<{ title: string; secondary: { href: string; label: string } }>) {
  return (
    <Section tone="paper" rhythm="base" aria-label="Get started">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="website-section-heading origin-centre text-foreground mx-auto mb-3 max-w-[28ch]">
          {title}
        </h2>
        <p className="website-body-lg text-muted mx-auto max-w-[52ch]">
          Build a measurement practice your team can inspect, explain, and improve.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <DemoButtonLink className="w-full sm:w-auto">
            {DEMO_CTA}
            <ArrowRight aria-hidden />
          </DemoButtonLink>
          <ButtonLink href={secondary.href} variant="ghost" className="w-full sm:w-auto">
            {secondary.label}
          </ButtonLink>
        </div>
      </Reveal>
    </Section>
  );
}

export function BlogIndex() {
  const summaries = POSTS.map(toBlogPostSummary);
  return (
    <>
      <header className="border-border-subtle border-b py-10 md:py-12">
        <Container>
          <Reveal className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div>
              <p className="website-eyebrow text-accent-text">Blog</p>
              <h1 className="website-page-title text-foreground mt-4">
                Practical insights for AI visibility
              </h1>
              <p className="website-body-lg text-muted mt-5 max-w-[56ch]">
                Guides, frameworks and lessons from building for the AI search era.
                <br className="hidden sm:block" /> Find content gaps, strengthen your sources and
                measure progress.
              </p>
            </div>
            <div className="relative hidden aspect-[12/7] lg:block">
              <Image
                src="/blog/editorial/hero-ai-visibility.svg"
                alt=""
                aria-hidden="true"
                fill
                priority
                sizes="(max-width: 1279px) 288px, 384px"
                className="object-contain"
              />
            </div>
          </Reveal>
        </Container>
      </header>

      {summaries.length ? (
        <Section tone="paper" rhythm="tight" aria-label="Blog articles">
          <BlogIndexExplorer posts={summaries} />
        </Section>
      ) : (
        <Section tone="paper" rhythm="tight" aria-label="No posts yet">
          <Reveal className="border-border-subtle mx-auto max-w-xl rounded-[var(--radius-card)] border border-dashed p-10 text-center">
            <span className="bg-accent-soft text-accent-text mx-auto grid size-10 place-items-center rounded-[var(--radius-control)]">
              <PenLine aria-hidden className="size-5" />
            </span>
            <h2 className="website-section-heading text-foreground mt-6">
              {BLOG_EMPTY_STATE.heading}
            </h2>
            <p className="website-body text-muted mx-auto mt-3 max-w-[48ch]">
              {BLOG_EMPTY_STATE.body}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <DemoButtonLink>
                {DEMO_CTA}
                <ArrowRight aria-hidden />
              </DemoButtonLink>
              <ButtonLink href="/faq" variant="ghost">
                Read the FAQ
              </ButtonLink>
            </div>
          </Reveal>
        </Section>
      )}

      <BlogCta
        title="Put these guides into practice."
        secondary={{ href: '/faq', label: 'Read the FAQ' }}
      />
    </>
  );
}

/**
 * The companion rail beside a post: contents, then the byline.
 *
 * It earns the width the prose deliberately does not take. Sticky from `lg`
 * up, where there is a second column to be sticky in; below that it is a
 * plain block above the article, so a phone still reads top to bottom.
 *
 * A post with no headings gets no contents list rather than an empty box —
 * short guides are a real case and a lone "Contents" label helps nobody.
 */
function PostAside({ post }: Readonly<{ post: BlogPost }>) {
  const headings = post.body.filter(
    (block): block is { type: 'heading'; text: string } => block.type === 'heading',
  );

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      {headings.length > 0 && (
        <nav aria-label="On this page">
          <p className="website-eyebrow text-muted mb-3">Contents</p>
          <ol className="grid gap-2">
            {withOccurrenceKeys(headings, (block) => block.text).map(({ key, value }) => (
              <li key={key}>
                <a
                  href={`#${headingId(value.text)}`}
                  className="text-muted hover:text-foreground text-sm transition-colors"
                >
                  {value.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {post.author && (
        <div className="border-border-subtle mt-6 border-t pt-6 lg:mt-8 lg:pt-8">
          <p className="website-eyebrow text-muted mb-3">Written by</p>
          <p className="website-body text-foreground flex items-center gap-2 font-medium">
            {post.author}
            {post.authorUrl ? (
              <a
                href={post.authorUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`${post.author} on LinkedIn`}
                className="text-muted hover:text-accent-text inline-flex"
              >
                <LinkedInMark />
              </a>
            ) : null}
          </p>
          {post.authorRole && (
            <Meta as="p" className="mt-1.5">
              {post.authorRole}
            </Meta>
          )}
        </div>
      )}
    </aside>
  );
}

function ArticleLinks({ post }: Readonly<{ post: BlogPost }>) {
  const postIndex = POSTS.findIndex((candidate) => candidate.slug === post.slug);
  const previous = postIndex > 0 ? POSTS[postIndex - 1] : undefined;
  const next = postIndex >= 0 ? POSTS[postIndex + 1] : undefined;
  const related = post.relatedSlugs
    .map((slug) => POSTS.find((candidate) => candidate.slug === slug))
    .filter((candidate): candidate is BlogPost => Boolean(candidate));

  return (
    <div className="border-border-subtle mt-10 border-t pt-8">
      {post.sources.length ? (
        <section aria-labelledby="article-sources">
          <h2 id="article-sources" className="website-feature-heading text-foreground">
            Sources
          </h2>
          <ol className="website-body text-muted mt-4 grid list-decimal gap-3 pl-5">
            {post.sources.map((source) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-text decoration-accent-border underline underline-offset-4 hover:decoration-current"
                >
                  {source.title}
                </a>{' '}
                — {source.publisher}
                {source.publishedDate ? ` (${formatBlogDate(source.publishedDate)})` : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {related.length ? (
        <section aria-labelledby="related-reading" className="mt-10">
          <h2 id="related-reading" className="website-feature-heading text-foreground">
            Related reading
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {related.map((relatedPost) => (
              <li key={relatedPost.slug}>
                <Link
                  href={`/blog/${relatedPost.slug}`}
                  className="border-border-subtle bg-panel hover:border-accent-border text-foreground focus-ring block rounded-[var(--radius-control)] border p-4 text-sm font-medium transition-colors"
                >
                  {relatedPost.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(previous || next) && (
        <nav aria-label="Previous and next articles" className="mt-10 grid gap-4 sm:grid-cols-2">
          {previous ? (
            <Link
              href={`/blog/${previous.slug}`}
              className="border-border-subtle hover:border-accent-border focus-ring rounded-[var(--radius-control)] border p-4 transition-colors"
            >
              <span className="website-label text-muted">Previous</span>
              <span className="text-foreground mt-1 block text-sm font-medium">
                {previous.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/blog/${next.slug}`}
              className="border-border-subtle hover:border-accent-border focus-ring rounded-[var(--radius-control)] border p-4 text-right transition-colors"
            >
              <span className="website-label text-muted">Next</span>
              <span className="text-foreground mt-1 block text-sm font-medium">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      )}
    </div>
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
      <header className="border-border-subtle border-b pt-16 pb-8 md:pb-10">
        <Container>
          <Reveal className="mx-auto w-full max-w-4xl text-center lg:max-w-5xl">
            <Link
              href="/blog"
              className="text-muted hover:text-foreground mx-auto mb-5 flex w-fit items-center gap-2 text-sm font-medium transition-colors"
            >
              <ArrowLeft className="size-4" aria-hidden />
              All guides
            </Link>
            <TagRow tags={post.tags} className="justify-center" />
            <h1 className="website-page-title origin-centre text-foreground mx-auto mt-4 max-w-4xl text-balance">
              {post.title}
            </h1>
            <PostByline
              post={post}
              linkedin
              className="border-border-subtle mt-6 justify-center border-t pt-5"
            />
          </Reveal>
        </Container>
      </header>

      <Container>
        <div className="grid w-full gap-10 py-8 md:py-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
          <PostAside post={post} />
          <article aria-label="Post content" className="min-w-0">
            <p className="website-body-lg bg-accent-soft text-foreground mb-6 rounded-[var(--radius-card)] px-5 py-4 font-medium">
              {post.excerpt}
            </p>
            {withOccurrenceKeys(post.body, blockIdentity).map(({ key, value }) => (
              <PostBlock key={key} block={value} sources={post.sources} />
            ))}
            <ArticleLinks post={post} />
          </article>
        </div>
      </Container>

      <BlogCta
        title="Make AI visibility measurable."
        secondary={{ href: '/blog', label: 'All guides' }}
      />
    </>
  );
}
