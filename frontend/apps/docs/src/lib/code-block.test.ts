// @vitest-environment node
// The Markdown build runs in Node; Sätteri's native reader rejects jsdom's ArrayBuffer.
import { satteri } from '@astrojs/markdown-satteri';
import { describe, expect, it } from 'vitest';
import { docsMarkdownBlocks } from './code-block';

/** Render Markdown through the docs' processor, as the Astro build does. */
async function render(markdown: string) {
  const renderer = await satteri({ hastPlugins: [docsMarkdownBlocks] }).createRenderer({
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
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain(
      '<code><span class="cl-code-muted"># Start a run</span>\n<span class="cl-code-muted">$ </span>curl https://api.citeladder.com</code>',
    );
  });

  it('leaves the language out of the bar when the fence names none', async () => {
    const html = await render('```\n{ "ok": true }\n```\n');
    expect(html).toContain('<figcaption class="cl-code-bar"><button');
    expect(html).toContain('<code>{ "ok": true }</code>');
  });

  it('frames a table so it scrolls inside the prose column', async () => {
    const html = await render('| A | B |\n| - | - |\n| 1 | 2 |\n');
    expect(html).toMatch(/^<div class="cl-prose-table"><table>/);
  });
});
