import { afterEach, describe, expect, it } from 'vitest';

import { mountMarketingNav, routePath } from './marketing-nav';

describe('routePath', () => {
  it('reads the homepage from its prerendered file name', () => {
    expect(routePath('/index.html')).toBe('/');
    expect(routePath('/')).toBe('/');
  });

  it('reads a page and a nested page from their prerendered file names', () => {
    expect(routePath('/enterprise.html')).toBe('/enterprise');
    expect(routePath('/platform/site-health.html')).toBe('/platform/site-health');
    expect(routePath('/blog/index.html')).toBe('/blog');
  });

  it('keeps an on-demand route as the browser shows it', () => {
    expect(routePath('/pricing')).toBe('/pricing');
    expect(routePath('/pricing/')).toBe('/pricing');
  });
});

/** The chrome as MarketingNav.astro renders it on the homepage, reduced to the strip and the bar. */
function renderChrome(announcement: string): HTMLElement {
  document.body.innerHTML = `
    <div data-marketing-nav="true">
      <div class="lp-announcement" data-announcement="${announcement}">
        <a href="/platform/mcp">New: connect CiteLadder</a>
        <button type="button" aria-label="Dismiss announcement" data-announcement-close></button>
      </div>
      <nav aria-label="Main navigation"><a href="/" aria-label="CiteLadder home">CiteLadder</a></nav>
    </div>`;
  const chrome = document.querySelector<HTMLElement>('[data-marketing-nav]');
  if (!chrome) throw new Error('the chrome rendered');
  mountMarketingNav(chrome);
  return chrome;
}

function strip(): string | null {
  return document.querySelector('.lp-announcement')?.textContent?.trim() ?? null;
}

describe('the announcement strip', () => {
  afterEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('closes, hands focus to the home link, and stays closed on the next visit', () => {
    renderChrome('mcp-connect');
    document.querySelector<HTMLButtonElement>('[data-announcement-close]')?.click();

    expect(strip()).toBe(null);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('CiteLadder home');

    renderChrome('mcp-connect');
    expect(strip()).toBe(null);
  });

  it('shows a new announcement after an earlier one was closed', () => {
    renderChrome('mcp-connect');
    document.querySelector<HTMLButtonElement>('[data-announcement-close]')?.click();

    renderChrome('agent-launch');
    expect(strip()).toBe('New: connect CiteLadder');
  });
});
