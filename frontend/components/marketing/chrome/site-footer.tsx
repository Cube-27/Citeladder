import { ArrowUpRight } from 'lucide-react';

import { LogoMark } from '@/components/ui/logo-mark';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import {
  FOOTER_COLUMNS,
  FOOTER_POLICY_LINKS,
  FOOTER_SOCIAL,
  FOOTER_TAGLINE,
  type FooterLink,
  type SocialNetwork,
} from '@/lib/marketing-content/nav';

import { GITHUB_MARK_PATH } from '../primitives/github-mark';
import { COOKIE_PREFERENCES_ATTRIBUTE } from './cookie-banner';
import './site-footer.css';

// lucide-react no longer ships brand marks, so the glyphs are inlined.
const SOCIAL_GLYPHS: Record<SocialNetwork, string> = {
  github: GITHUB_MARK_PATH,
  linkedin:
    'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z',
  x: 'M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.48l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.48 3.24H4.3l13.31 17.41Z',
};

function ColumnLink({ link }: Readonly<{ link: FooterLink }>) {
  if (!link.external) {
    return (
      <a className="focus-ring" href={link.href}>
        {link.label}
      </a>
    );
  }
  return (
    <a className="focus-ring" href={link.href} target="_blank" rel="noreferrer">
      {link.label}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </a>
  );
}

/** The social profiles as one row of icon-only links, named by their domains. */
function SocialLinks() {
  return (
    <ul className="cl-footer-social">
      {FOOTER_SOCIAL.map((link) => (
        <li key={link.network}>
          <a
            className="cl-footer-social-link focus-ring"
            href={link.href}
            target="_blank"
            rel="noreferrer"
            aria-label={link.label}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
              <path d={SOCIAL_GLYPHS[link.network]} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}

// Stamped by the build. Pages prerender in workerd, where Date reads the Unix
// epoch outside a request, so a module-level `new Date()` rendered "© 1970".
// Tests run without the define and fall back to the local clock.
const COPYRIGHT_YEAR = Number(process.env.PUBLIC_BUILD_YEAR) || new Date().getFullYear();

/**
 * Launch-directory badges, in each directory's own embed markup, on one row.
 * Loaded eagerly: lazy, they missed long pages' renders.
 */
function DirectoryBadges() {
  return (
    <div className="cl-footer-badges">
      <a
        className="focus-ring"
        href="https://www.codehype.ai/product/citeladder?utm_source=codehype_badge"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="https://www.codehype.ai/badges/citeladder.svg?variant=find-us&v=20"
          alt="Featured on CodeHype"
          width={112}
          height={40}
          decoding="async"
          referrerPolicy="no-referrer"
          className="cl-footer-badge"
        />
      </a>
      <a
        className="focus-ring"
        href="https://tools.launchllama.co/products/citeladder?utm_source=badge&utm_medium=referral"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="https://tools.launchllama.co/featured-badge.png?v=2"
          alt="Featured on Launch"
          width={112}
          height={29}
          decoding="async"
          referrerPolicy="no-referrer"
          className="cl-footer-badge"
        />
      </a>
    </div>
  );
}

/**
 * The website footer (the system's SiteFooter): the brand and tagline beside
 * five link columns on the page's paper under a hairline, then the ownership line and the
 * policy row, with the directory badges at its right. Every column comes from `lib/marketing-content/nav.ts`, the
 * same registry as the navbar. Static: it ships no island.
 */
export function SiteFooter() {
  return (
    <footer className="cl-footer">
      <div className="cl-container">
        <div className="cl-footer-top">
          <div className="cl-footer-brand">
            <a href="/" aria-label="CiteLadder home" className="cl-footer-logo focus-ring">
              <LogoMark className="text-ink" />
            </a>
            <p className="cl-footer-tagline">{FOOTER_TAGLINE}</p>
            <SocialLinks />
          </div>
          <nav aria-label="Footer" className="cl-footer-cols">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.key} className="cl-footer-col">
                {/* A column title names its list; it is not a heading of the page. */}
                <p id={`footer-col-${column.key}`} className="cl-footer-head">
                  {column.label}
                </p>
                <ul aria-labelledby={`footer-col-${column.key}`}>
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <ColumnLink link={link} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="cl-footer-bottom">
          <div className="cl-footer-bottom-main">
            {/* CiteLadder is a Cube27 product, so the parent company is named in
              the ownership line rather than tucked into a link column alone. */}
            <p className="cl-footer-copy">
              © {COPYRIGHT_YEAR} CiteLadder. A{' '}
              <a className="focus-ring" href={PARENT_COMPANY.href} target="_blank" rel="noreferrer">
                {PARENT_COMPANY.name}
              </a>{' '}
              product. All rights reserved.
            </p>
            <nav aria-label="Legal">
              <ul className="cl-footer-legal">
                {FOOTER_POLICY_LINKS.map((link) => (
                  <li key={link.href}>
                    <a className="focus-ring" href={link.href}>
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="cl-footer-cookie focus-ring"
                    {...{ [COOKIE_PREFERENCES_ATTRIBUTE]: '' }}
                  >
                    Cookie preferences
                  </button>
                </li>
              </ul>
            </nav>
          </div>
          <DirectoryBadges />
        </div>
      </div>
    </footer>
  );
}
