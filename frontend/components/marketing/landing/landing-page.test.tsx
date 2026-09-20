import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';

import { LandingPage } from './landing-page';

describe('LandingPage', () => {
  it('shows four static monitored surfaces without provider attribution', () => {
    render(<LandingPage />);

    const engines = screen.getByRole('region', { name: 'Monitored answer engines' });
    for (const name of ['ChatGPT', 'Gemini', 'Claude', 'Google AI Overviews']) {
      expect(within(engines).getByText(name)).toBeVisible();
    }
    expect(screen.queryByText(/dataforseo/i)).toBeNull();
  });

  it('switches capability tabs and the Sources URL view', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    const tabs = screen.getByRole('tablist', { name: 'CiteLadder capabilities' });
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
    await user.click(screen.getByRole('link', { name: 'Visibility analysis' }));
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
