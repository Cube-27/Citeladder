import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';

import { LandingPage } from './landing-page';

describe('LandingPage', () => {
  it('shows four static monitored surfaces without provider attribution', () => {
    render(<LandingPage />);

    const roster = screen.getByLabelText('ChatGPT, Gemini, Claude and Google AI Overviews');
    for (const name of ['ChatGPT', 'Gemini', 'Claude', 'Google AI Overviews']) {
      expect(within(roster).getByText(name)).toBeVisible();
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
    const sourceView = within(panel).getByLabelText('Source view');
    await user.click(within(sourceView).getByRole('button', { name: 'URLs' }));
    expect(within(panel).getByRole('columnheader', { name: 'URL' })).toBeVisible();
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
  });
});
