import { ArrowLeft, ArrowRight, PenLine } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { BLOG_EMPTY_STATE, POSTS, type BlogPost } from '@/lib/marketing-content/blog';
import { DEMO_CTA } from '@/lib/marketing-content/nav';
import { blogPostingJsonLd } from '@/lib/seo/json-ld';
import { cn } from '@/lib/utils';

import { blockIdentity, headingId, PostBlock, withOccurrenceKeys } from '../blog/post-blocks';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { Meta } from '../primitives/label';
import { LinkedInMark } from '../primitives/linkedin-mark';
import { PageHero } from '../primitives/page-hero';
import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Container, Section } from '../primitives/section';
import { JsonLd } from '../seo/json-ld';

/**
 * `/blog` and `/blog/[slug]`.
 *
 * Heading rule: index post titles render as paragraphs with role="heading" +
 * aria-level rather than literal h2/h3 — a title may contain "CiteLadder" and
 * no h2–h6 on the marketing surface may. Post view uses real h2s for body
 * headings (those are editorial, not product-name headings).
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
  const items = [
    post.author ? (
      <AuthorByline key="author" name={post.author} href={linkedin ? post.authorUrl : undefined} />
    ) : null,
    post.date ? <span key="date">PUBLISHED : {post.date}</span> : null,
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
    <Section tone="sunken" rhythm="base" aria-label="Get started">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="website-section-heading text-foreground mx-auto mb-3 max-w-[28ch]">
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
  const [featured, ...rest] = POSTS;
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Make AI visibility"
        accent="understandable."
        lead="Practical guides for answer-engine optimization, evidence-led measurement, and the work between a finding and the next audit."
        centered
      />

      {featured ? (
        <>
          <Section rhythm="tight" aria-label="Featured post">
            <Reveal>
              <Link
                href={`/blog/${featured.slug}`}
                aria-label={featured.title}
                className="bg-panel border-border group hover:border-accent-border block overflow-hidden rounded-[var(--radius-card)] border transition-colors duration-200"
              >
                <div className="flex flex-col md:flex-row md:items-stretch">
                  <div className="bg-panel-tonal relative min-h-[200px] w-full shrink-0 overflow-hidden md:min-h-0 md:w-[22%] lg:w-[20%]">
                    <Image
                      src={featured.image}
                      alt=""
                      aria-hidden="true"
                      fill
                      priority
                      sizes="(max-width: 768px) 100vw, 320px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-center p-7 md:p-10">
                    <TagRow tags={featured.tags} />
                    <h2 className="website-section-heading text-foreground group-hover:text-accent-text max-w-[32ch] transition-colors duration-200">
                      {featured.title}
                    </h2>
                    <p className="website-body-lg text-muted mt-4 max-w-[65ch]">
                      {featured.excerpt}
                    </p>
                    <PostByline post={featured} />
                    <span className="text-accent-text mt-5 inline-flex items-center gap-2 text-sm font-medium">
                      Read guide
                      <ArrowRight
                        className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </div>
                </div>
              </Link>
            </Reveal>
          </Section>

          {rest.length > 0 && (
            <Section tone="paper" rhythm="tight" aria-label="All guides">
              <div className="mb-5 flex items-center justify-between gap-4">
                <Meta as="p">All guides</Meta>
                <Meta>
                  {rest.length} {rest.length === 1 ? 'guide' : 'guides'}
                </Meta>
              </div>
              <StaggerGroup className="divide-border-subtle bg-panel border-border-subtle divide-y overflow-hidden rounded-[var(--radius-card)] border">
                {rest.map((post) => (
                  <StaggerItem key={post.slug}>
                    <Link
                      href={`/blog/${post.slug}`}
                      aria-label={post.title}
                      className="hover:bg-accent-soft/40 group flex flex-col transition-colors duration-200 md:flex-row md:items-stretch"
                    >
                      <div className="bg-panel-tonal relative min-h-[160px] w-full shrink-0 overflow-hidden md:min-h-0 md:w-[22%] lg:w-[20%]">
                        <Image
                          src={post.image}
                          alt=""
                          aria-hidden="true"
                          fill
                          sizes="(max-width: 768px) 100vw, 260px"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="flex flex-1 flex-col justify-center px-6 py-6 md:px-8 md:py-7">
                        <TagRow tags={post.tags} />
                        <h3 className="website-feature-heading text-foreground group-hover:text-accent-text transition-colors duration-200">
                          {post.title}
                        </h3>
                        <p className="website-body text-muted mt-2 max-w-[65ch]">{post.excerpt}</p>
                        <PostByline post={post} />
                      </div>
                    </Link>
                  </StaggerItem>
                ))}
              </StaggerGroup>
            </Section>
          )}
        </>
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
            <h1 className="website-page-title text-foreground mx-auto mt-4 max-w-4xl text-balance">
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
              <PostBlock key={key} block={value} />
            ))}
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
