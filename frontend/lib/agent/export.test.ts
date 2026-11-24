import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ saveBlob: vi.fn() }));
vi.mock('@/lib/download', () => ({ saveBlob: mocks.saveBlob }));

import { downloadPage, pageExport } from './export';

const BODY = [
  '# Pricing',
  '',
  'Plans start at **ten** dollars. [Compare](https://example.com/compare).',
  '',
  '- Starter',
  '  - Monthly',
  '- Teams',
  '',
  '| Plan | Price |',
  '| --- | --- |',
  '| Starter | $10 |',
  '',
  '<script>alert(1)</script>',
  '',
].join('\n');

afterEach(() => mocks.saveBlob.mockReset());

describe('pageExport', () => {
  it('copies the Markdown as written, with one final newline', () => {
    expect(pageExport('# Pricing\n\nPlans.\n\n\n', 'markdown')).toBe('# Pricing\n\nPlans.\n');
  });

  it('renders HTML through the app’s Markdown pipeline, raw HTML left out', () => {
    const html = pageExport(BODY, 'html');
    expect(html).toContain('<h1>Pricing</h1>');
    expect(html).toContain(
      '<p>Plans start at <strong>ten</strong> dollars. <a href="https://example.com/compare">Compare</a>.</p>',
    );
    expect(html).toContain('<td>Starter</td>');
    expect(html).not.toContain('<script>');
  });

  it('writes plain text without Markdown marks, keeping lists and tables readable', () => {
    expect(pageExport(BODY, 'text')).toBe(
      [
        'Pricing',
        '',
        'Plans start at ten dollars. Compare.',
        '',
        '- Starter',
        '  - Monthly',
        '- Teams',
        '',
        'Plan\tPrice',
        'Starter\t$10',
        '',
      ].join('\n'),
    );
  });
});

describe('downloadPage', () => {
  it('downloads a standalone HTML file with the title tag, meta description and JSON-LD', async () => {
    const fields = { meta_description: 'Plans & "prices"', json_ld: '{"name":"</script>"}' };
    downloadPage({ title: 'Pricing <Plans> & more', body: '# Pricing', fields }, 'html');
    const [blob, filename] = mocks.saveBlob.mock.calls[0] as [Blob, string];
    expect(filename).toBe('pricing-plans-more.html');
    const text = await blob.text();
    expect(text).toContain('<title>Pricing &lt;Plans&gt; &amp; more</title>');
    expect(text).toContain('<meta name="description" content="Plans &amp; &quot;prices&quot;">');
    expect(text).toContain(
      String.raw`<script type="application/ld+json">{"name":"<\/script>"}</script>`,
    );
    expect(text).toContain('<body>\n<h1>Pricing</h1>\n</body>');
  });

  it('downloads the Markdown as a .md file, the search listing as front matter', async () => {
    downloadPage({ title: 'Pricing', body: 'Plans.', fields: null }, 'md');
    const [blob, filename] = mocks.saveBlob.mock.calls[0] as [Blob, string];
    expect(filename).toBe('pricing.md');
    expect(await blob.text()).toBe('Plans.\n');
    const fields = { meta_description: 'Our "plans"', json_ld: '' };
    downloadPage({ title: 'Pricing', body: 'Plans.', fields }, 'md');
    const [listed] = mocks.saveBlob.mock.calls[1] as [Blob, string];
    expect(await listed.text()).toBe(
      String.raw`---
title: "Pricing"
description: "Our \"plans\""
---

Plans.
`,
    );
  });
});
