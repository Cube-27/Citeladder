import { afterEach, describe, expect, it } from 'vitest';

import { inSection, mountSiteNav, routePath } from './site-nav';

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

describe('inSection', () => {
  it('marks a menu current on its own page and the pages under it, not on a lookalike', () => {
    expect(inSection('/platform', '/platform')).toBe(true);
    expect(inSection('/platform/mcp', '/platform')).toBe(true);
    expect(inSection('/platforms', '/platform')).toBe(false);
  });
});

/** The navbar as SiteNav.astro renders it, reduced to the sheet. */
function renderNav(): HTMLElement {
  document.body.innerHTML = `
    <header data-site-nav>
      <div class="cl-navbar-anchor">
        <nav aria-label="Main navigation">
          <a href="/" aria-label="CiteLadder home">CiteLadder</a>
          <button type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu"></button>
        </nav>
        <div id="mobile-menu" hidden>
          <button type="button" aria-expanded="false" aria-controls="acc-platform">Platform</button>
          <div id="acc-platform" hidden><a href="/platform">Platform overview</a></div>
        </div>
      </div>
    </header>
    <main><a href="/pricing">Pricing</a></main>`;
  const chrome = document.querySelector<HTMLElement>('[data-site-nav]');
  if (!chrome) throw new Error('the navbar rendered');
  mountSiteNav(chrome);
  return chrome;
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} rendered`);
  return element;
}

function button(selector: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`${selector} rendered`);
  return element;
}

const press = (key: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

describe('the mobile sheet', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('holds the page and focus while open and hands both back on Escape', () => {
    renderNav();
    const toggle = button('button[aria-controls="mobile-menu"]');
    const main = document.querySelector('main');

    toggle.click();
    expect(byId('mobile-menu').hidden).toBe(false);
    expect(toggle.getAttribute('aria-label')).toBe('Close menu');
    expect(main?.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(button('button[aria-controls="acc-platform"]'));

    press('Escape');
    expect(byId('mobile-menu').hidden).toBe(true);
    expect(toggle.getAttribute('aria-label')).toBe('Open menu');
    expect(main?.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(toggle);
  });

  it('opens one accordion at a time and closes it on a second tap', () => {
    renderNav();
    button('button[aria-controls="mobile-menu"]').click();
    const accordion = button('button[aria-controls="acc-platform"]');

    accordion.click();
    expect(byId('acc-platform').hidden).toBe(false);
    accordion.click();
    expect(byId('acc-platform').hidden).toBe(true);
  });
});
