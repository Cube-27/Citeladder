import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { LandingPage } from './landing-page';
import { HeroTour } from './landing-tour';

afterEach(() => vi.unstubAllEnvs());

describe('LandingPage', () => {
  it.each([
    ['true', 'Start free trial', 'https://app.citeladder.com/register'],
    ['false', 'Book a demo', '/contact'],
  ])('routes the hero action with self-serve signup %s', (enabled, label, href) => {
    vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', enabled);
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(<LandingPage tour={<HeroTour />} />);

    const hero = screen.getByRole('banner');
    expect(within(hero).getAllByRole('link', { name: label })[0]).toHaveAttribute('href', href);
  });

  it('labels API collection apart from consumer answer surfaces', () => {
    render(<LandingPage tour={<HeroTour />} />);

    const engines = screen.getByRole('region', { name: 'Monitored answer engines' });
    for (const name of ['OpenAI API', 'Gemini API', 'Claude API', 'Google AI Overviews']) {
      expect(within(engines).getByText(name)).toBeVisible();
    }
  });

  it('switches the product tour with clicks and arrow keys', async () => {
    const user = userEvent.setup();
    render(<LandingPage tour={<HeroTour />} />);

    const tabs = screen.getByRole('tablist', { name: 'Product tour' });
    const visibility = within(tabs).getByRole('tab', { name: 'Visibility' });
    expect(visibility).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Visibility');

    await user.click(within(tabs).getByRole('tab', { name: 'Site Health' }));
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Site Health');
    expect(within(screen.getByRole('tabpanel')).getByText('AI crawler access')).toBeVisible();

    await user.keyboard('{ArrowRight}');
    const agent = within(tabs).getByRole('tab', { name: 'Agent' });
    expect(agent).toHaveFocus();
    expect(agent).toHaveAttribute('aria-selected', 'true');
  });
});
