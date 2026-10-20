import { ArrowUpRight } from 'lucide-react';

import { LogoMark } from '@/components/ui/logo-mark';

import { FOOTER_LEGAL_LINKS, PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { NAV_DROPS, PLATFORM_GROUPS, PLATFORM_OVERVIEW } from '@/lib/marketing-content/nav';
import {
  CITELADDER_GITHUB,
  CITELADDER_LINKEDIN,
  CITELADDER_X,
} from '@/lib/marketing-content/social';

import { GITHUB_MARK_PATH } from '../primitives/github-mark';
import { Container } from '../primitives/section';
import { COOKIE_PREFERENCES_ATTRIBUTE } from './cookie-banner';

type SocialNetwork = 'github' | 'linkedin' | 'x';

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
  /** A social profile renders its network's mark in place of the external arrow. */
  social?: SocialNetwork;
};

// lucide-react no longer ships brand marks, so the glyphs are inlined.
const SOCIAL_GLYPHS: Record<SocialNetwork, string> = {
  github: GITHUB_MARK_PATH,
  linkedin:
    'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z',
  x: 'M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.48l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.48 3.24H4.3l13.31 17.41Z',
};

function SocialGlyph({ network }: Readonly<{ network: SocialNetwork }>) {
  return (
    <svg viewBox="0 0 24 24" className="mr-1 size-3.5" fill="currentColor" aria-hidden>
      <path d={SOCIAL_GLYPHS[network]} />
    </svg>
  );
}
type FooterColumn = { key: string; label: string; links: readonly FooterLink[] };

/**
 * Footer columns derive from the same registry as the header, so a published
 * destination cannot drift between the two. Platform reads as one list: the
 * overview first, then every capability in menu order.
 */
const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    key: 'platform',
    label: 'Platform',
    links: [
      { label: PLATFORM_OVERVIEW.title, href: PLATFORM_OVERVIEW.href },
      ...PLATFORM_GROUPS.flatMap((group) =>
        group.items.map((item) => ({ label: item.title, href: item.href })),
      ),
    ],
  },
  ...NAV_DROPS.filter((drop) => drop.key !== 'platform').map((drop) => ({
    key: drop.key,
    label: drop.label,
    links: drop.groups.flatMap((group) =>
      group.items.map((item) => ({
        label: item.title,
        href: item.href,
        external: 'external' in item && item.external,
      })),
    ),
  })),
  {
    key: 'company',
    label: 'Company',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Enterprise', href: '/enterprise' },
      { label: 'Pricing', href: '/pricing' },
      { label: PARENT_COMPANY.name, href: PARENT_COMPANY.href, external: true },
      { label: 'AI Instructions', href: '/ai-instructions' },
      { label: 'Entity Map', href: '/entity-map' },
      { label: 'github.com', href: CITELADDER_GITHUB, external: true, social: 'github' },
      { label: 'x.com', href: CITELADDER_X, external: true, social: 'x' },
      { label: 'linkedin.com', href: CITELADDER_LINKEDIN, external: true, social: 'linkedin' },
    ],
  },
];

function FooterColumnLink({ link }: Readonly<{ link: FooterLink }>) {
  if (link.social) {
    return (
      <a className="footer-link" href={link.href} target="_blank" rel="noreferrer">
        <SocialGlyph network={link.social} />
        {link.label}
      </a>
    );
  }
  if (link.external) {
    return (
      <a className="footer-link" href={link.href} target="_blank" rel="noreferrer">
        {link.label}
        <ArrowUpRight className="size-3 opacity-60" aria-hidden />
      </a>
    );
  }
  return (
    <a className="footer-link" href={link.href}>
      {link.label}
    </a>
  );
}

// Stamped by the build. Pages prerender in workerd, where Date reads the Unix
// epoch outside a request, so a module-level `new Date()` rendered "© 1970".
// Tests run without the define and fall back to the local clock.
const COPYRIGHT_YEAR = Number(process.env.PUBLIC_BUILD_YEAR) || new Date().getFullYear();

/** Shared footer: every published destination, the ownership line and each policy. */
export async function MarketingFooter() {
  // NOSONAR -- 'use cache' requires an async function
  'use cache';

  const year = COPYRIGHT_YEAR;

  return (
    <footer className="site-footer">
      <Container className="pt-16 pb-10 md:pt-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,4fr)] lg:gap-16">
          <div className="flex flex-col items-start gap-5">
            <a href="/" aria-label="CiteLadder home" className="focus-ring inline-block rounded-xs">
              <LogoMark />
            </a>
            <p className="website-body max-w-[30ch]">
              See what AI answers say about your brand, and what to fix next.
            </p>
            {/* Launch-directory badges, in each directory's own embed markup. */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="https://www.codehype.ai/product/citeladder?utm_source=codehype_badge"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="https://www.codehype.ai/badges/citeladder.svg?variant=find-us&v=20"
                  alt="Featured on CodeHype"
                  width={180}
                  height={65}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full max-w-45"
                />
              </a>
              <span className="inline-flex flex-col items-center">
                <a
                  href="https://tools.launchllama.co/products/citeladder?utm_source=badge&utm_medium=referral"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    src="https://tools.launchllama.co/featured-badge.png?v=2"
                    alt="Featured on Launch"
                    width={200}
                    height={52}
                    loading="lazy"
                    decoding="async"
                    className="block"
                  />
                </a>
                <a
                  href="https://launchmcp.co/?utm_source=badge&utm_medium=referral"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted hover:text-foreground text-xs font-semibold"
                >
                  Launch MCP
                </a>
              </span>
            </div>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.key} className="min-w-0">
                <h2 className="footer-heading">{column.label}</h2>
                <ul className="mt-4 grid gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <FooterColumnLink link={link} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* CiteLadder is a Cube27 product, so the parent company is named in
              the ownership line rather than tucked into a link column alone. */}
          <p className="website-label text-muted">
            © {year} CiteLadder. A{' '}
            <a
              href={PARENT_COMPANY.href}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
            >
              {PARENT_COMPANY.name}
            </a>{' '}
            product. All rights reserved.
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2 lg:justify-end">
            {/* Contact already sits in the Company column. */}
            {FOOTER_LEGAL_LINKS.filter((link) => link.href !== '/contact').map((link) => (
              <a key={link.href} className="footer-legal-link" href={link.href}>
                {link.label}
              </a>
            ))}
            <button
              type="button"
              className="footer-legal-link"
              {...{ [COOKIE_PREFERENCES_ATTRIBUTE]: '' }}
            >
              Cookie preferences
            </button>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
