import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { LandingPage } from './landing-page';

afterEach(() => vi.unstubAllEnvs());

describe('LandingPage', () => {
  it.each([
    ['true', 'Start free trial', 'https://app.citeladder.com/register'],
    ['false', 'Explore citation tracking', '/ai-citation-tracking'],
  ])('routes the hero action with self-serve signup %s', (enabled, label, href) => {
    vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', enabled);
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(<LandingPage />);

    const hero = screen.getByRole('banner');
    expect(within(hero).getByRole('link', { name: label })).toHaveAttribute('href', href);
  });

  it('distinguishes API collection from consumer answer surfaces', () => {
    render(<LandingPage />);

    const engines = screen.getByRole('region', { name: 'Monitored answer engines' });
    for (const name of ['OpenAI API', 'Gemini API', 'Claude API', 'Google AI Overviews']) {
      expect(within(engines).getByText(name)).toBeVisible();
    }
    expect(screen.queryByText(/dataforseo/i)).toBeNull();
  });

  it('switches capability tabs and the Sources URL view', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    const tabs = screen.getByRole('tablist', { name: 'CiteLadder capabilities' });
    for (const tab of within(tabs).getAllByRole('tab')) {
      const panelId = tab.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();
      expect(document.getElementById(panelId!)).toBeInTheDocument();
    }
    const sources = within(tabs).getByRole('tab', { name: /sources/i });
    expect(sources).toHaveTextContent('Sources');
    expect(sources).toHaveAttribute('aria-selected', 'true');

    const panel = screen.getByRole('tabpanel', { name: /sources/i });
    const sourceView = within(panel).getByRole('group', { name: 'Source view' });
    await user.click(within(sourceView).getByRole('button', { name: 'URLs' }));
    expect(within(panel).getByRole('columnheader', { name: 'URL' })).toBeVisible();
    expect(within(panel).getByText('URL usage across completed answers')).toBeVisible();
    expect(within(panel).getByText('zernovelle.example/platform')).toBeVisible();
    await user.click(within(sourceView).getByRole('button', { name: 'Domains' }));
    expect(within(panel).getByRole('columnheader', { name: 'Domain' })).toBeVisible();

    await user.click(within(tabs).getByRole('tab', { name: /site health/i }));
    expect(screen.getByRole('tabpanel', { name: /site health/i })).toBeVisible();
    await user.keyboard('{ArrowRight}');
    expect(within(tabs).getByRole('tab', { name: /demand intelligence/i })).toHaveFocus();
    await user.click(within(tabs).getByRole('tab', { name: /ai visibility/i }));
    expect(within(tabs).getByRole('tab', { name: /ai visibility/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const comparison = within(screen.getByRole('tabpanel', { name: 'Trends' })).getByRole(
      'region',
      { name: 'Competitor comparison preview' },
    );
    expect(within(comparison).getByRole('cell', { name: 'Brelovanta' })).toBeVisible();
    expect(within(comparison).getByRole('cell', { name: '58.2%' })).toBeVisible();
    expect(
      screen.getByText(/Zernovelle up 12\.4 percentage points from 52\.0% to 64\.4%/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Source mix preview' })).getByText(
        '30% of citations',
      ),
    ).toBeInTheDocument();
  });

  it('opens source evidence in a dismissible drawer and restores focus', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    const sourceButton = screen.getByRole('button', { name: /Platform documentation/ });
    await user.click(sourceButton);
    const drawer = screen.getByRole('dialog', { name: 'Source record' });
    expect(within(drawer).getByText('zernovelle.example/platform')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Source record' })).not.toBeInTheDocument();
    expect(sourceButton).toHaveFocus();
  });
});
