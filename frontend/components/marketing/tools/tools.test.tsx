import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { CrawlerChecker, RobotsGenerator } from './robots-tools';
import { MetaChecker, StructuredDataBuilder } from './markup-tools';
import { SitemapComparison } from './sitemap-tool';
import { SocialPreview } from './social-tool';
const bots = [{ label: 'GPTBot', purpose: 'ai_training', tokens: ['GPTBot'] }];

describe('free tools user workflows', () => {
  it.each([
    [
      'crawler',
      () => <CrawlerChecker bots={bots} />,
      'Test crawler rules',
      'Blocked by supplied rules',
    ],
    [
      'generator',
      () => <RobotsGenerator bots={bots} />,
      'Generate and test rules',
      'User-agent: GPTBot',
    ],
    ['meta', () => <MetaChecker />, 'Inspect declarations', 'An indexing restriction is declared'],
    ['schema', () => <StructuredDataBuilder />, 'Build JSON-LD', 'datePublished'],
    ['sitemap', () => <SitemapComparison />, 'Compare sitemaps', 'Removed (1)'],
    ['social', () => <SocialPreview />, 'Generate social tags', 'og:title'],
  ])('runs the %s example and offers a report', (_name, component, action, evidence) => {
    render(component());
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Generated output' }).value,
    ).toContain(evidence);
    expect(screen.getByRole('button', { name: 'Copy result' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });
  it('hides stale results after editing and shows actionable validation errors', () => {
    render(<CrawlerChecker bots={bots} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test crawler rules' }));
    fireEvent.change(screen.getByLabelText('Page URL to test'), { target: { value: 'not a URL' } });
    expect(screen.queryByLabelText('Generated output')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Test crawler rules' }));
    expect(screen.getByRole('alert')).toHaveTextContent('complete http:// or https:// URL');
  });
  it('keeps the example when an earlier sitemap upload finishes afterward', async () => {
    render(<SitemapComparison />);
    let finishRead!: (bytes: ArrayBuffer) => void;
    const pendingRead = new Promise<ArrayBuffer>((resolve) => {
      finishRead = resolve;
    });
    const file = new File(['pending XML'], 'previous.xml', { type: 'application/xml' });
    Object.defineProperty(file, 'arrayBuffer', { value: () => pendingRead });
    fireEvent.change(screen.getByLabelText('Upload previous sitemap xml'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    const example = screen.getByLabelText<HTMLTextAreaElement>('Previous sitemap XML').value;
    await act(async () => {
      finishRead(new TextEncoder().encode('<urlset/>').buffer);
      await pendingRead;
    });
    expect(screen.getByLabelText('Previous sitemap XML')).toHaveValue(example);
    fireEvent.click(screen.getByRole('button', { name: 'Compare sitemaps' }));
    expect(screen.getByLabelText<HTMLTextAreaElement>('Generated output').value).toContain(
      'Removed (1)',
    );
  });
});
