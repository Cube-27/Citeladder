import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COOKIE_CONSENT_STORAGE_KEY, writeConsent } from '@/lib/consent/cookie-consent';

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

  it('keeps the accepted decision for this page when storage is unavailable', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable');
    });
    try {
      render(
        <>
          <GoogleAnalytics measurementId="G-TEST" />
          <CookieBanner />
        </>,
      );

      await user.click(await screen.findByRole('button', { name: 'Accept' }));

      expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
      expect(screen.getByTestId('external-script')).toBeInTheDocument();
    } finally {
      setItem.mockRestore();
      writeConsent('rejected');
    }
  });
  it('tells the loaded tag that consent was withdrawn', async () => {
    const gtag = vi.fn();
    Object.defineProperty(window, 'gtag', { value: gtag, configurable: true, writable: true });
    try {
      writeConsent('accepted');
      render(<GoogleAnalytics measurementId="G-TEST" />);
      expect(screen.getByTestId('google-analytics')).toBeInTheDocument();

      // Revocation arrives from the Cookie Policy page or another tab. Dropping
      // the elements cannot stop a tag that has already run, so the component
      // has to say so on Consent Mode's channel.
      await act(async () => writeConsent('rejected'));

      expect(screen.queryByTestId('google-analytics')).not.toBeInTheDocument();
      expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'denied' });
    } finally {
      Reflect.deleteProperty(window, 'gtag');
      writeConsent('rejected');
    }
  });
});
