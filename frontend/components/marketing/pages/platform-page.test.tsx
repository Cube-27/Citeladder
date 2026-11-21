import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { PLATFORM_PAGES } from '@/lib/marketing-content/platform-pages';

import { PlatformActions, PlatformPageContent } from './platform-page';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['trial', true, 'Start free trial', 'https://app.citeladder.com/register'],
  ['trial', false, 'Book a demo', '/contact'],
  ['demo', true, 'Start free trial', 'https://app.citeladder.com/register'],
  ['setup', false, 'Book a demo', '/contact'],
] as const)('leads %s pages with signup enabled=%s', (cta, enabled, label, href) => {
  vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', String(enabled));
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
  render(<PlatformActions cta={cta} />);
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  if (label !== 'Start free trial') {
    expect(screen.queryByRole('link', { name: 'Start free trial' })).not.toBeInTheDocument();
  }
});

it('renders the hero screen alone and the highlights, steps, questions and FAQ a page declares', () => {
  render(
    <PlatformPageContent
      page={{
        path: '/platform/site-health',
        updated: '2026-11-06',
        title: 'Site Health | CiteLadder',
        description: 'Crawl your site.',
        heading: 'Find site issues',
        lead: 'Crawl and review.',
        cta: 'demo',
        screen: 'site-health',
        highlights: [{ title: 'Page-level evidence', body: 'Every finding names its page.' }],
        features: [
          {
            title: 'Know which AI crawlers you let in',
            body: 'Read robots.txt by purpose.',
            points: ['Search, training and user fetch'],
            media: { kind: 'split', screen: 'crawler-access' },
          },
        ],
        steps: [
          { title: 'Crawl', body: 'Sample the site.' },
          { title: 'Recrawl', body: 'Verify the fix.' },
        ],
        questions: ['Did our fixes land?'],
        faqs: [{ q: 'Does it score llms.txt?', a: 'No, it is a diagnostic.' }],
        closing: 'Start here',
        related: ['/platform/search-demand'],
      }}
    />,
  );
  expect(
    screen.getByRole('img', { name: 'Site health for acme.com: score 82, 7 failed checks' })
      .textContent,
  ).toMatch(/^Site healthacme\.com · 7 failed checksScore 82/);
  expect(screen.getAllByText('Score 82')).toHaveLength(1);
  expect(screen.queryByText('Pages blocked')).not.toBeInTheDocument();
  expect(
    screen.getByRole('img', { name: 'AI crawler access to acme.com from robots.txt' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'Page-level evidence' })).toBeVisible();
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
  expect(
    within(screen.getByRole('region', { name: 'Keep exploring' })).getByRole('link', {
      name: /Search Demand/,
    }),
  ).toHaveAttribute('href', '/platform/search-demand');
});

it('leads the MCP page with the connect strip, then its steps, and closes it with the guide and a demo', () => {
  const page = PLATFORM_PAGES.find((candidate) => candidate.path === '/platform/mcp');
  if (!page) throw new Error('MCP page missing');
  render(<PlatformPageContent page={page} />);
  const hero = screen.getByRole('heading', { level: 1 }).closest('section');
  if (!hero) throw new Error('hero missing');
  const closing = screen.getByRole('region', { name: 'Get started' });
  expect(within(hero).getByRole('link', { name: 'Connect to Claude' })).toHaveAttribute(
    'href',
    'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=CiteLadder&connectorUrl=https%3A%2F%2Fapi.citeladder.com%2Fmcp',
  );
  const step = screen.getByRole('heading', { level: 3, name: '2. Sign in and approve' });
  expect(hero).not.toContainElement(step);
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

it('never shows one screen twice on a platform page', () => {
  for (const page of PLATFORM_PAGES) {
    const screens = [
      page.screen,
      ...page.features.flatMap((feature) =>
        feature.media.kind === 'card' ? [] : [feature.media.screen],
      ),
    ];
    expect(new Set(screens).size, page.path).toBe(screens.length);
  }
});
