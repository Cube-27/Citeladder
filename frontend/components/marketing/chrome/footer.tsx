import { ArrowUpRight } from 'lucide-react';

import { LogoMark } from '@/components/ui/logo-mark';

import { COMPETITORS } from '@/lib/marketing-content/compare';
import {
  FOOTER_LEGAL_LINKS,
  PARENT_COMPANY,
  type LegalLink,
  legalDisplayName,
} from '@/lib/marketing-content/legal';
import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF } from '@/lib/marketing-content/nav';

import { Container } from '../primitives/section';

type FooterLink = { label: string; href: string; external?: boolean };
type FooterColumn = { key: string; label: string; links: readonly FooterLink[] };

const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    key: 'platform',
    label: 'Platform',
    links: [
      { label: 'What CiteLadder reveals', href: '/#why' },
      { label: 'The operating loop', href: '/#how-it-works' },
      { label: 'See it', href: '/#see-it' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Enterprise', href: '/enterprise' },
    ],
  },
  {
    key: 'resources',
    label: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    key: 'solutions',
    label: 'Solutions',
    links: [
      { label: 'Agencies', href: '/solutions#agencies' },
      { label: 'In-house teams', href: '/solutions#in-house' },
      { label: 'Founders', href: '/solutions#founders' },
      { label: 'Ecommerce', href: '/solutions#commerce' },
      { label: 'PR & comms', href: '/solutions#pr' },
    ],
  },
  {
    key: 'compare',
    label: 'Compare',
    links: [
      { label: 'All comparisons', href: '/compare' },
      ...COMPETITORS.map((competitor) => ({
        label: `vs ${competitor.name}`,
        href: `/compare/${competitor.slug}`,
      })),
    ],
  },
  {
    key: 'company',
    label: 'Company',
    links: [
      // No `mailto:` here. Cloudflare's email obfuscation rewrites a raw
      // address into `/cdn-cgi/l/email-protection#<hex>` and injects a decoder
      // script: the link is dead without JS -- invisible to the AI crawlers
      // this product exists to be read by -- and the rewritten URL 404s once
      // its fragment is dropped, which a crawler then books as a broken
      // internal link on every page carrying this footer. `DEMO_CTA` already
      // reaches the parent company's contact form, which is where the address
      // led anyway.
      { label: DEMO_CTA, href: DEMO_HREF, external: DEMO_EXTERNAL },
      { label: PARENT_COMPANY.name, href: PARENT_COMPANY.href, external: true },
      {
        label: `${PARENT_COMPANY.name} on LinkedIn`,
        href: PARENT_COMPANY.linkedin,
        external: true,
      },
      { label: 'Log in', href: '/login' },
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

function LegalStripLink({ link }: Readonly<{ link: LegalLink }>) {
  if (link.external) {
    return (
      <a className={LEGAL_STRIP_LINK} href={link.href} target="_blank" rel="noreferrer">
        {link.label}
      </a>
    );
  }
  return (
    <a className={LEGAL_STRIP_LINK} href={link.href}>
      {link.label}
    </a>
  );
}

/** Shared editorial footer; destinations and legal ownership stay unchanged. */
export async function MarketingFooter() {
  'use cache';

  const year = new Date().getFullYear();
  const name = legalDisplayName();

  return (
    <footer className="bg-background border-border-subtle relative overflow-hidden border-t">
      <Container className="pt-14 sm:pt-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)] lg:gap-12">
          <div className="space-y-5">
            <a href="/" aria-label="CiteLadder home" className="inline-block">
              <LogoMark />
            </a>

            <p className="website-body text-muted max-w-[38ch]">
              AI search intelligence with source-level context.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-7 gap-y-9 sm:grid-cols-3 xl:grid-cols-5"
          >
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.key}>
                <h2 className="website-small-heading text-foreground mb-5">{column.label}</h2>
                <div className="grid justify-items-start gap-3.5">
                  {column.links.map((link) => (
                    <FooterColumnLink key={link.label} link={link} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-border-subtle mt-12 flex flex-col gap-5 border-t pt-8 lg:flex-row lg:items-center lg:justify-between">
          {/* CiteLadder is a Cube27 product, so the parent company is named in
              the ownership line rather than tucked into a link column alone. */}
          <p className="website-label text-muted">
            © {year} {name}. A{' '}
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
            {FOOTER_LEGAL_LINKS.map((link) => (
              <LegalStripLink key={link.href} link={link} />
            ))}
          </nav>
        </div>
        <div aria-hidden="true" className="mt-4 overflow-hidden pb-7 sm:mt-5 sm:pb-8">
          <LogoMark size={72} className="max-w-full opacity-20" />
        </div>
      </Container>
    </footer>
  );
}
