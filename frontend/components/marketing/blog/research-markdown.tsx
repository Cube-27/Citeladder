import { Children, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { headingId } from './post-blocks';

export function researchHeadings(markdown: string) {
  // The one group always takes part in a match.
  return Array.from(markdown.matchAll(/^## (.+)$/gm), ([, text = '']) => ({
    text,
    slug: headingId(text),
  }));
}

function inlineText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
}

/**
 * Prose elements carry no measure or colour classes: the `cp-prose` article
 * column owns reading measure, rhythm and link styling for its direct children,
 * so a research guide and a block post read identically.
 */
const components: Components = {
  h2: ({ children }) => (
    <h2 id={headingId(inlineText(children))} className="website-section-heading cp-prose-h2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={headingId(inlineText(children))} className="website-feature-heading cp-prose-h3">
      {children}
    </h3>
  ),
  th: ({ children }) => <th scope="col">{children}</th>,
};

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
          className="cp-table cp-table-wide focus-ring"
        >
          <table>{children}</table>
        </section>
      );
    },
  };
}

const sourceComponents: Components = {
  ...components,
  ol: ({ children }) => (
    <ol className="cp-sources">
      {Children.toArray(children)
        .filter((child) => typeof child !== 'string')
        .map((child, index) => (
          <li key={index + 1} id={`source-${index + 1}`} className="scroll-mt-28">
            {child}
          </li>
        ))}
    </ol>
  ),
  // The Sources list owns the numbered li and anchor; its child holds the copy.
  li: ({ children }) => <span>{children}</span>,
};

/** No hydration: article copy, links and table accessibility arrive in HTML. */
export function ResearchMarkdown({ markdown }: Readonly<{ markdown: string }>) {
  const sourceStart = markdown.search(/^## Sources/m);
  const body = sourceStart >= 0 ? markdown.slice(0, sourceStart) : markdown;
  const sources =
    sourceStart >= 0
      ? markdown.slice(sourceStart).replace(/<span id="source-\d+"><\/span> /g, '')
      : '';
  return (
    <>
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents(body)} skipHtml>
        {body}
      </Markdown>
      <Markdown remarkPlugins={[remarkGfm]} components={sourceComponents} skipHtml>
        {sources}
      </Markdown>
    </>
  );
}
