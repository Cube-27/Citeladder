import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { LandingPage } from './landing-page';
import { EngineRotor } from './landing-rotor';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('LandingPage', () => {
  it.each([
    ['true', 'Start free trial', 'https://app.citeladder.com/register'],
    ['false', 'Book a demo', '/contact'],
  ])('routes the hero action with self-serve signup %s', (enabled, label, href) => {
    vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', enabled);
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(<LandingPage />);

    const hero = screen.getByRole('banner');
    expect(within(hero).getAllByRole('link', { name: label })[0]).toHaveAttribute('href', href);
  });

  it('names the hero by its full sentence while the rotor cycles', () => {
    render(<LandingPage rotor={<EngineRotor />} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      'Analyze what ChatGPT, Gemini and Claude tell your buyers about you.',
    );
  });

  it('labels API collection apart from consumer answer surfaces', () => {
    render(<LandingPage />);

    const engines = screen.getByRole('region', { name: 'Monitored answer engines' });
    for (const name of ['OpenAI API', 'Gemini API', 'Claude API', 'Google AI Overviews']) {
      expect(within(engines).getByText(name)).toBeVisible();
    }
  });
});
