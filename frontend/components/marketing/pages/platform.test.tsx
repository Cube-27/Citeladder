import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { PLATFORM_PAGES } from '@/lib/marketing-content/platform-pages';

import { PlatformActions, PlatformPageContent } from './platform';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['trial', true, 'Start free trial', 'https://app.citeladder.com/register'],
  ['trial', false, 'Book a demo', '/contact'],
  ['demo', true, 'Book a demo', '/contact'],
  ['setup', true, 'Discuss setup', '/contact'],
] as const)('leads %s pages with signup enabled=%s', (cta, enabled, label, href) => {
  vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', String(enabled));
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
  render(<PlatformActions cta={cta} />);
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  if (label !== 'Start free trial') {
    expect(screen.queryByRole('link', { name: 'Start free trial' })).not.toBeInTheDocument();
  }
});

it('renders the steps, questions and FAQ a capability page declares', () => {
  render(
    <PlatformPageContent
      page={{
        path: '/platform/site-health',
        title: 'Site Health | CiteLadder',
        description: 'Crawl your site.',
        heading: 'Find site issues.',
        lead: 'Crawl and review.',
        cta: 'demo',
        visual: 'pillars',
        visualTitle: 'Site Health · Overview',
        highlights: [],
        features: [],
        steps: [
          { title: 'Crawl', body: 'Sample the site.' },
          { title: 'Recrawl', body: 'Verify the fix.' },
        ],
        questions: ['Did our fixes land?'],
        faqs: [{ q: 'Does it score llms.txt?', a: 'No, it is a diagnostic.' }],
        closing: 'Start here.',
        related: [],
      }}
    />,
  );
  const steps = screen.getByRole('region', { name: 'How it works' });
  expect(
    within(steps)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent),
  ).toEqual(['Crawl', 'Recrawl']);
  expect(
    within(screen.getByRole('region', { name: 'Questions you can answer' })).getByText(
      'Did our fixes land?',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Does it score llms.txt?')).toBeInTheDocument();
  expect(screen.getByText('AEO Readiness')).toBeInTheDocument();
});

it('leads the MCP page with the connect strip and closes it with the guide and a demo', () => {
  const page = PLATFORM_PAGES.find((candidate) => candidate.path === '/platform/mcp');
  if (!page) throw new Error('MCP page missing');
  render(<PlatformPageContent page={page} />);
  const hero = document.querySelector('[data-cta-placement="hero"]') as HTMLElement;
  const closing = document.querySelector('[data-cta-placement="closing"]') as HTMLElement;
  expect(within(hero).getByRole('link', { name: 'Connect to Claude' })).toHaveAttribute(
    'href',
    'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=CiteLadder&connectorUrl=https%3A%2F%2Fciteladder.com%2Fmcp',
  );
  expect(within(hero).queryByRole('link', { name: 'Book a demo' })).not.toBeInTheDocument();
  expect(within(closing).getByRole('link', { name: 'Read the MCP docs' })).toHaveAttribute(
    'href',
    'https://docs.citeladder.com/mcp/',
  );
  expect(within(closing).getByRole('link', { name: 'Book a demo' })).toBeInTheDocument();
  expect(
    within(closing).queryByRole('link', { name: 'Connect to Claude' }),
  ).not.toBeInTheDocument();
});
