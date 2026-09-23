import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { COOKIE_CONSENT_STORAGE_KEY, writeConsent } from '@/lib/consent/cookie-consent';

import { CookieBanner } from '../marketing/chrome/cookie-banner';
import { GoogleAnalytics } from './google-analytics';

describe('GoogleAnalytics', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    document
      .querySelectorAll('[data-testid="external-script"]')
      .forEach((script) => script.remove());
    Reflect.deleteProperty(window, 'dataLayer');
    Reflect.deleteProperty(window, 'gtag');
  });

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

  it('loads the tag after acceptance in the same tab', async () => {
    const user = userEvent.setup();
    render(
      <>
        <GoogleAnalytics measurementId="G-TEST" />
        <CookieBanner />
      </>,
    );

    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe('accepted');
    const documentQueries = within(document.documentElement);
    expect(await documentQueries.findByTestId('external-script')).toHaveAttribute(
      'src',
      'https://www.googletagmanager.com/gtag/js?id=G-TEST',
    );
    const script = documentQueries.getByTestId('external-script');
    const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer;
    expect(dataLayer).toEqual([
      ['consent', 'default', { analytics_storage: 'granted' }],
      expect.arrayContaining(['js', expect.any(Date)]),
    ]);
    act(() => script.dispatchEvent(new Event('load')));
    expect(dataLayer).toEqual([
      ['consent', 'default', { analytics_storage: 'granted' }],
      expect.arrayContaining(['js', expect.any(Date)]),
      ['consent', 'update', { analytics_storage: 'granted' }],
      ['config', 'G-TEST'],
    ]);
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
      expect(
        await within(document.documentElement).findByTestId('external-script'),
      ).toBeInTheDocument();
    } finally {
      setItem.mockRestore();
      writeConsent('rejected');
    }
  });
  it('tells the loaded tag that consent was withdrawn', async () => {
    const gtag = vi.fn();
    try {
      writeConsent('accepted');
      render(<GoogleAnalytics measurementId="G-TEST" />);
      const script = within(document.documentElement).getByTestId('external-script');
      act(() => script.dispatchEvent(new Event('load')));
      Object.defineProperty(window, 'gtag', { value: gtag, configurable: true, writable: true });

      // A loaded tag continues to run after its script element exists, so
      // revocation must reach it through Consent Mode.
      await act(async () => writeConsent('rejected'));

      expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'denied' });
    } finally {
      Reflect.deleteProperty(window, 'gtag');
      writeConsent('rejected');
    }
  });

  it('does not configure a pending tag after consent is revoked', async () => {
    writeConsent('accepted');
    render(<GoogleAnalytics measurementId="G-TEST" />);
    const script = within(document.documentElement).getByTestId('external-script');

    await act(async () => writeConsent('rejected'));
    act(() => script.dispatchEvent(new Event('load')));

    expect((window as Window & { dataLayer?: unknown[] }).dataLayer).toEqual([
      ['consent', 'default', { analytics_storage: 'denied' }],
      expect.arrayContaining(['js', expect.any(Date)]),
      ['consent', 'update', { analytics_storage: 'denied' }],
    ]);
  });

  it('preserves other consent defaults when revoking a pending tag', async () => {
    writeConsent('accepted');
    render(<GoogleAnalytics measurementId="G-TEST" />);
    const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
    const ownDefault = dataLayer[0] as unknown[];
    ownDefault[2] = { analytics_storage: 'granted', ad_storage: 'denied' };
    const otherDefault = [
      'consent',
      'default',
      { analytics_storage: 'granted', ad_storage: 'granted' },
    ];
    const adOnlyDefault = ['consent', 'default', { ad_storage: 'granted' }];
    const pendingEvent = ['event', 'page_view'];
    dataLayer.push(otherDefault, adOnlyDefault, pendingEvent);

    await act(async () => writeConsent('rejected'));

    expect(ownDefault[2]).toEqual({ analytics_storage: 'denied', ad_storage: 'denied' });
    expect(otherDefault[2]).toEqual({ analytics_storage: 'denied', ad_storage: 'granted' });
    expect(adOnlyDefault[2]).toEqual({ ad_storage: 'granted' });
  });

  it('reuses the document tag after remount without configuring twice', () => {
    writeConsent('accepted');
    const first = render(<GoogleAnalytics measurementId="G-TEST" />);
    const script = within(document.documentElement).getByTestId('external-script');
    act(() => script.dispatchEvent(new Event('load')));
    first.unmount();

    render(<GoogleAnalytics measurementId="G-TEST" />);

    expect(document.querySelectorAll('#citeladder-google-analytics')).toHaveLength(1);
    const commands = (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
    expect(commands.filter((command) => Array.isArray(command) && command[0] === 'config')).toEqual(
      [['config', 'G-TEST']],
    );
  });
});
