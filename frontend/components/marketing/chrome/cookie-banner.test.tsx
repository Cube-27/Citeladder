import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { COOKIE_CONSENT_STORAGE_KEY, hasAnalyticsConsent } from '@/lib/consent/cookie-consent';

import { CookieBanner } from './cookie-banner';

/**
 * What is worth pinning is the consent contract, not the layout: the banner
 * appears only while undecided, both answers are one click, and — the part a
 * regulator cares about — rejecting must leave `hasAnalyticsConsent` false so
 * a future analytics loader stays off.
 */
describe('CookieBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('asks an undecided visitor, offering reject and accept equally', async () => {
    render(<CookieBanner />);

    const region = await screen.findByRole('region', { name: 'Cookie consent' });
    expect(region).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cookie Policy' })).toHaveAttribute('href', '/cookies');
  });

  it('grants consent on accept and dismisses', async () => {
    const user = userEvent.setup();
    render(<CookieBanner />);
    await screen.findByRole('region', { name: 'Cookie consent' });

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe('accepted');
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('withholds consent on reject and dismisses', async () => {
    const user = userEvent.setup();
    render(<CookieBanner />);
    await screen.findByRole('region', { name: 'Cookie consent' });

    await user.click(screen.getByRole('button', { name: 'Reject' }));

    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe('rejected');
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('stays hidden once the visitor has already answered', () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'accepted');

    render(<CookieBanner />);

    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
  });

  it('re-asks when the stored value is not a decision it wrote', async () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'yes-please');

    render(<CookieBanner />);

    expect(await screen.findByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
    expect(hasAnalyticsConsent()).toBe(false);
  });
});
