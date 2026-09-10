import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COOKIE_CONSENT_STORAGE_KEY } from '@/lib/consent/cookie-consent';

import { CookieBanner } from '../marketing/chrome/cookie-banner';
import { GoogleAnalytics } from './google-analytics';

vi.mock('next/script', () => ({
  default: ({ id, src }: { id?: string; src?: string }) => (
    <script data-testid={id ?? 'external-script'} data-src={src} />
  ),
}));

describe('GoogleAnalytics', () => {
  beforeEach(() => window.localStorage.clear());

  it('does not render a tag before consent or after rejection', async () => {
    const user = userEvent.setup();
    render(
      <>
        <GoogleAnalytics measurementId="G-TEST" />
        <CookieBanner />
      </>,
    );

    expect(screen.queryByTestId('external-script')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(screen.queryByTestId('external-script')).not.toBeInTheDocument();
  });

  it('loads the tag lazily after acceptance in the same tab', async () => {
    const user = userEvent.setup();
    render(
      <>
        <GoogleAnalytics measurementId="G-TEST" />
        <CookieBanner />
      </>,
    );

    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe('accepted');
    expect(screen.getByTestId('external-script')).toHaveAttribute(
      'data-src',
      'https://www.googletagmanager.com/gtag/js?id=G-TEST',
    );
    expect(screen.getByTestId('google-analytics')).toBeInTheDocument();
  });
});
