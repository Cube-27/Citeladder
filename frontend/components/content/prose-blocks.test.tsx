// @vitest-environment node
// The Markdown build runs in Node; Sätteri's native reader rejects jsdom's ArrayBuffer.
import { satteri } from '@astrojs/markdown-satteri';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { proseMarkdownBlocks, rehypeProseBlocks } from './prose-blocks';

async function render(markdown: string) {
  const renderer = await satteri({ hastPlugins: [proseMarkdownBlocks] }).createRenderer({
    syntaxHighlight: false,
  });
  return (await renderer.render(markdown)).code;
}

describe('docs Markdown blocks', () => {
  it('turns a fence into a CodeBlock with its language, a copy button and muted comments', async () => {
    const html = await render('```bash\n# Start a run\n$ curl https://api.citeladder.com\n```\n');
    expect(html).toContain(
      '<figcaption class="cl-code-bar"><span class="cl-code-lang">bash</span>',
    );
    expect(html).toMatch(
      /<output class="cl-code-status"[^>]*><\/output><button[^>]*>.*Copy<\/button>/,
    );
    expect(html).toContain(
      '<code><span class="cl-code-muted"># Start a run</span>\n<span class="cl-code-muted">$ </span>curl https://api.citeladder.com</code>',
    );
  });

  it('leaves the language out of the bar when the fence names none', async () => {
    const html = await render('```\n{ "ok": true }\n```\n');
    expect(html).toContain('<figcaption class="cl-code-bar"><output class="cl-code-status"');
    expect(html).toContain('<code>{ "ok": true }</code>');
  });

  it('frames a table so it scrolls inside the prose column', async () => {
    const html = await render('| A | B |\n| - | - |\n| 1 | 2 |\n');
    expect(html).toMatch(/^<div class="cl-prose-table"><table>/);
  });
});

function renderWebsite(markdown: string) {
  return renderToStaticMarkup(
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeProseBlocks]}>
      {markdown}
    </Markdown>,
  );
}

describe('website Markdown blocks', () => {
  it('turns a fence into the same CodeBlock the docs render', () => {
    const html = renderWebsite('```yaml\n# Compose\nservices: {}\n```\n');
    expect(html).toContain(
      '<figcaption class="cl-code-bar"><span class="cl-code-lang">yaml</span>',
    );
    expect(html).toMatch(
      /<output class="cl-code-status"[^>]*><\/output><button[^>]*>.*Copy<\/button>/,
    );
    expect(html).toContain(
      '<code><span class="cl-code-muted"># Compose</span>\nservices: {}</code>',
    );
  });

  it('frames a table and leaves paragraphs alone', () => {
    const html = renderWebsite('Intro\n\n| A | B |\n| - | - |\n| 1 | 2 |\n');
    expect(html).toMatch(/^<p>Intro<\/p>\n?<div class="cl-prose-table"><table>/);
  });
});
