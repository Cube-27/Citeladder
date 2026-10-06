import { Children, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { headingId } from './post-blocks';

export function researchHeadings(markdown: string) {
  return Array.from(markdown.matchAll(/^## (.+)$/gm), ([, text]) => ({
    text,
    slug: headingId(text),
  }));
}

function inlineText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
}

const components: Components = {
  h2: ({ children }) => (
    <h2
      id={headingId(inlineText(children))}
      className="website-section-heading text-foreground mt-10 mb-4 scroll-mt-28"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      id={headingId(inlineText(children))}
      className="website-feature-heading text-foreground mt-8 mb-3 scroll-mt-28"
    >
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="website-body-lg text-secondary mb-5">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} className="text-accent-text wrap-anywhere underline underline-offset-4">
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="website-body-lg text-secondary mb-6 list-disc pl-6">{children}</ul>
  ),
  ol: ({ children, start }) => (
    <ol start={start} className="website-body-lg text-secondary mb-6 list-decimal pl-6">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="mb-2">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="bg-accent-soft text-foreground border-accent-border my-6 border-l-2 px-5 py-4">
      {children}
    </blockquote>
  ),
  th: ({ children }) => (
    <th
      scope="col"
      className="border-border-subtle text-foreground bg-background-alt border-b px-4 py-3 align-top"
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-border-subtle text-secondary border-b px-4 py-3 align-top">{children}</td>
  ),
  pre: ({ children }) => <pre className="bg-well my-6 overflow-x-auto p-5">{children}</pre>,
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
          className="border-border-subtle bg-panel focus-ring my-6 overflow-x-auto rounded-[var(--radius-card)] border"
        >
          <table className="website-body w-full min-w-[40rem] border-collapse text-left">
            {children}
          </table>
        </section>
      );
    },
  };
}

const sourceComponents: Components = {
  ...components,
  ol: ({ children }) => (
    <ol className="website-body-lg text-secondary mb-6 list-decimal pl-6">
      {Children.toArray(children)
        .filter((child) => typeof child !== 'string')
        .map((child, index) => (
          <li key={index + 1} id={`source-${index + 1}`} className="mb-3 scroll-mt-28">
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
