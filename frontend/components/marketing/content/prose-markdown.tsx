import { Children, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { rehypeProseBlocks } from '@/components/content/prose-blocks';

import { FaqList } from '../sections/steps-faq-cta';
import { headingId } from './heading-id';
import './reading.css';

/** The guide's h2 headings, as Toc items whose ids match the rendered headings. */
export function researchHeadings(markdown: string) {
  // The one group always takes part in a match.
  return Array.from(markdown.matchAll(/^## (.+)$/gm), ([, text = '']) => ({
    id: headingId(text),
    label: text,
    level: 2,
  }));
}

function inlineText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
}

const CITATION_HREF = /^#source-\d+$/;

/**
 * Elements carry no classes, so Prose styles them; headings keep the ids the
 * Toc links to, and a `[\[n\]](#source-n)` link becomes an InlineCitation.
 */
const components: Components = {
  h2: ({ children }) => <h2 id={headingId(inlineText(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={headingId(inlineText(children))}>{children}</h3>,
  th: ({ children }) => <th scope="col">{children}</th>,
  a: ({ href, children }) =>
    href && CITATION_HREF.test(href) ? (
      <sup className="cl-icite">
        <a href={href} aria-label={`Source ${href.slice('#source-'.length)}`}>
          {children}
        </a>
      </sup>
    ) : (
      <a href={href}>{children}</a>
    ),
};

/** A single line keeps its inline content without a wrapping paragraph. */
const inlineComponents: Components = {
  ...components,
  p: ({ children }) => <>{children}</>,
};

/**
 * Each table is a region named by the heading above it, so a screen reader
 * says what it compares.
 */
function markdownComponents(markdown: string): Components {
  return {
    ...components,
    table: ({ children, node }) => {
      const precedingCopy = markdown
        .split('\n')
        .slice(0, (node?.position?.start.line ?? 1) - 1)
        .join('\n');
      const heading = Array.from(precedingCopy.matchAll(/^#{2,3} (.+)$/gm), ([, text]) => text).at(
        -1,
      );
      return (
        <section
          aria-labelledby={heading ? headingId(heading) : undefined}
          aria-label={heading ? undefined : 'Research table'}
          className="cl-prose-table"
        >
          <table>{children}</table>
        </section>
      );
    },
  };
}

/**
 * Research Markdown as Prose children, with no hydration: copy, links,
 * citations, fences (CodeBlocks) and tables arrive in the HTML. Raw HTML in
 * the Markdown is skipped.
 */
export function ProseMarkdown({ markdown }: Readonly<{ markdown: string }>) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeProseBlocks, { tables: false }]]}
      components={markdownComponents(markdown)}
      skipHtml
    >
      {markdown}
    </Markdown>
  );
}

/** A guide's FAQ section as a FaqList, each answer rendered from its Markdown. */
export function MarkdownFaq({
  items,
}: Readonly<{ items: readonly Readonly<{ question: string; answer: string }>[] }>) {
  return (
    <FaqList
      items={items.map((item) => ({
        id: headingId(item.question),
        question: item.question,
        answer: <ProseMarkdown markdown={item.answer} />,
      }))}
    />
  );
}

/** One line of Markdown (a source), without a wrapping paragraph. */
export function InlineMarkdown({ markdown }: Readonly<{ markdown: string }>) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={inlineComponents} skipHtml>
      {markdown}
    </Markdown>
  );
}
