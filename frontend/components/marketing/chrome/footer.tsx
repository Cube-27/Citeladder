import { ArrowUpRight } from 'lucide-react';

import { LogoMark } from '@/components/ui/logo-mark';

import { FOOTER_LEGAL_LINKS, PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { NAV_DROPS, PLATFORM_GROUPS, PLATFORM_OVERVIEW } from '@/lib/marketing-content/nav';
import { DemoButtonLink } from '../primitives/button';
import { CITELADDER_LINKEDIN } from '@/lib/marketing-content/social';

import { COOKIE_PREFERENCES_ATTRIBUTE } from './cookie-banner';

import { Container } from '../primitives/section';

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};
type FooterColumn = { key: string; label: string; links: readonly FooterLink[] };

const FOOTER_COLUMNS: readonly FooterColumn[] = [
  ...PLATFORM_GROUPS.map((group) => ({
    key: group.label,
    label: group.label,
    links: group.items.map((item) => ({ label: item.title, href: item.href })),
  })),
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

const LINK =
  'text-sm text-muted hover:text-foreground inline-flex items-center gap-2 transition-colors duration-300';

function FooterColumnLink({ link }: Readonly<{ link: FooterLink }>) {
  if (link.external) {
    return (
      <a className={LINK} href={link.href} target="_blank" rel="noreferrer">
        {link.label}
        <ArrowUpRight className="size-3" aria-hidden />
      </a>
    );
  }
  return (
    <a className={LINK} href={link.href}>
      {link.label}
    </a>
  );
}

const LEGAL_STRIP_LINK =
  'text-muted hover:text-foreground text-xs font-medium underline-offset-4 hover:underline';

/** Shared editorial footer: product links, the ownership line and every published policy. */
export async function MarketingFooter() {
  'use cache';

  const year = new Date().getFullYear();

  return (
    <footer className="marketing-footer relative">
      <div className="marketing-footer-card mx-auto w-full">
        <Container className="pt-14 pb-10 sm:pt-20 sm:pb-14">
          <div className="grid gap-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-5">
                <a href="/" aria-label="CiteLadder home" className="inline-block">
                  <LogoMark />
                </a>

                <p className="marketing-footer-description website-body max-w-[38ch]">
                  AI search intelligence. From observed answers to informed action.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <DemoButtonLink />
                <FooterColumnLink
                  link={{ label: PLATFORM_OVERVIEW.title, href: PLATFORM_OVERVIEW.href }}
                />
              </div>
            </div>

            <nav
              aria-label="Footer"
              className="hidden gap-x-7 gap-y-9 md:grid md:grid-cols-3 xl:grid-cols-6"
            >
              {FOOTER_COLUMNS.map((column) => (
                <div key={column.key}>
                  <h2 className="website-nav text-foreground mb-5">{column.label}</h2>
                  <div className="grid justify-items-start gap-3.5">
                    {column.links.map((link) => (
                      <FooterColumnLink key={link.label} link={link} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <nav aria-label="Footer mobile" className="md:hidden">
              {FOOTER_COLUMNS.map((column) => (
                <details key={column.key} className="border-border-subtle border-b py-4">
                  <summary className="website-nav cursor-pointer">{column.label}</summary>
                  <div className="grid justify-items-start gap-4 py-4">
                    {column.links.map((link) => (
                      <FooterColumnLink key={link.href} link={link} />
                    ))}
                  </div>
                </details>
              ))}
            </nav>
          </div>

          <div className="border-border-subtle mt-12 flex flex-col gap-5 border-t pt-8 lg:flex-row lg:items-center lg:justify-between">
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
                <a key={link.href} className={LEGAL_STRIP_LINK} href={link.href}>
                  {link.label}
                </a>
              ))}
              <a className={LEGAL_STRIP_LINK} href="/ai-instructions">
                AI Instructions
              </a>
              <a className={LEGAL_STRIP_LINK} href="/entity-map">
                Entity Map
              </a>
              <button
                type="button"
                className={LEGAL_STRIP_LINK}
                {...{ [COOKIE_PREFERENCES_ATTRIBUTE]: '' }}
              >
                Cookie preferences
              </button>
            </nav>
          </div>
        </Container>
      </div>
    </footer>
  );
}
