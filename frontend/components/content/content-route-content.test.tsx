import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SiteHealthReferenceInput } from '@/lib/api/content';
import { renderWithProviders } from '@/test/render';

import { ContentRouteContent } from './content-route-content';

vi.mock('./content-screen', () => ({
  ContentScreen: ({
    siteHealthReference,
  }: Readonly<{ siteHealthReference?: SiteHealthReferenceInput }>) => (
    <output data-testid="site-health-reference">{JSON.stringify(siteHealthReference)}</output>
  ),
}));

const REQUIRED_CONTEXT =
  'project_id=project&site_health_crawl_id=crawl&site_url_id=url&dimension=metadata';

describe('ContentRouteContent', () => {
  it('removes blank checkpoint identifiers before passing deep-link context', () => {
    renderWithProviders(<ContentRouteContent />, {
      initialEntries: [`/content?${REQUIRED_CONTEXT}&checkpoint_ids=%20&checkpoint_ids=title`],
    });

    expect(JSON.parse(screen.getByTestId('site-health-reference').textContent ?? '')).toEqual({
      project_id: 'project',
      crawl_id: 'crawl',
      site_url_id: 'url',
      dimension: 'metadata',
      checkpoint_ids: ['title'],
    });
  });

  it('rejects context containing only blank checkpoint identifiers', () => {
    renderWithProviders(<ContentRouteContent />, {
      initialEntries: [`/content?${REQUIRED_CONTEXT}&checkpoint_ids=`],
    });

    expect(screen.getByTestId('site-health-reference')).toHaveTextContent('');
  });
});
