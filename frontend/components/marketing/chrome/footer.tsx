import { ArrowUpRight } from 'lucide-react';

import { LogoMark } from '@/components/ui/logo-mark';

import { FOOTER_LEGAL_LINKS, PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { NAV_DROPS, PLATFORM_GROUPS, PLATFORM_OVERVIEW } from '@/lib/marketing-content/nav';
import { CITELADDER_LINKEDIN } from '@/lib/marketing-content/social';

import { Container } from '../primitives/section';
import { COOKIE_PREFERENCES_ATTRIBUTE } from './cookie-banner';

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};
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
      { label: 'CiteLadder on LinkedIn', href: CITELADDER_LINKEDIN, external: true },
    ],
  },
];

function FooterColumnLink({ link }: Readonly<{ link: FooterLink }>) {
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

/** Shared footer: every published destination, the ownership line and each policy. */
export async function MarketingFooter() {
  'use cache';

  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <Container className="pt-16 pb-10 md:pt-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,4fr)] lg:gap-16">
          <div className="flex flex-col items-start gap-5">
            <a href="/" aria-label="CiteLadder home" className="focus-ring inline-block rounded-xs">
              <LogoMark />
            </a>
            <p className="website-body text-muted max-w-[30ch]">
              AI search intelligence. From observed answers to informed action.
            </p>
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

        <div className="border-border mt-16 flex flex-col gap-4 border-t pt-6 lg:flex-row lg:items-center lg:justify-between">
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
            <a className="footer-legal-link" href="/ai-instructions">
              AI Instructions
            </a>
            <a className="footer-legal-link" href="/entity-map">
              Entity Map
            </a>
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
