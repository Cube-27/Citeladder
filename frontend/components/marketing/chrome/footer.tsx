import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { LogoMark } from '@/components/ui/logo-mark';

import { COMPETITORS } from '@/lib/marketing-content/compare';
import {
  FOOTER_LEGAL_LINKS,
  PARENT_COMPANY,
  type LegalLink,
  legalDisplayName,
} from '@/lib/marketing-content/legal';
import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF } from '@/lib/marketing-content/nav';
import { CONTACT_EMAIL } from '@/lib/marketing-content/social';

import { Container } from '../primitives/section';

type FooterLink = { label: string; href: string; external?: boolean };
type FooterColumn = { key: string; label: string; links: readonly FooterLink[] };

const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    key: 'platform',
    label: 'Platform',
    links: [
      { label: 'The shift', href: '/#why' },
      { label: 'How it works', href: '/#how-it-works' },
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
      ...(CONTACT_EMAIL ? [{ label: 'Contact', href: `mailto:${CONTACT_EMAIL}` }] : []),
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
  return link.href.startsWith('/') ? (
    <Link className={LINK} href={link.href}>
      {link.label}
    </Link>
  ) : (
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
    <Link className={LEGAL_STRIP_LINK} href={link.href}>
      {link.label}
    </Link>
  );
}

/**
 * Marketing footer — link columns plus a compact legal strip. Owner-supplied
 * registration details stay off the public page until they are complete.
 */
export async function MarketingFooter() {
  'use cache';

  const year = new Date().getFullYear();
  const name = legalDisplayName();

  return (
    <footer className="border-border-subtle bg-active/60 relative border-t">
      <Container className="py-12 sm:py-16">
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]"
        >
          <div className="col-span-2 space-y-5 sm:col-span-3 lg:col-span-1">
            <Link href="/" aria-label="CiteLadder home" className="inline-block">
              <LogoMark size={24} />
            </Link>

            <p className="website-body text-muted max-w-[28ch]">
              Verifiable AI visibility. Every metric opens to the answer it came from.
            </p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.key} className="space-y-4">
              <h2 className="website-eyebrow text-foreground mb-4 font-medium">{column.label}</h2>
              <div className="grid justify-items-start gap-4">
                {column.links.map((link) => (
                  <FooterColumnLink key={link.label} link={link} />
                ))}
              </div>
            </div>
          ))}
        </nav>

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
      </Container>
    </footer>
  );
}
