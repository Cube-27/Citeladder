import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { appHref } from '@/lib/config/app-link';
import { docsHref } from '@/lib/config/docs';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { PLATFORM_GROUPS, PLATFORM_OVERVIEW, platformLabel } from '@/lib/marketing-content/nav';
import { TRIAL_NOTE, type PlatformPage } from '@/lib/marketing-content/platform-pages';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';
import { PlatformPreview } from '../scenes/platform-preview';

const GUIDE_LABELS: Record<string, string> = {
  '/ai-citation-tracking': 'AI citation tracking guide',
  '/ai-search-share-of-voice': 'AI share of voice',
  '/solutions#commerce': 'Ecommerce solutions',
};

const SECONDARY_ACTIONS: Readonly<Record<string, { href: string; label: string }>> = {
  '/platform/citation-intelligence': {
    href: '/ai-citation-tracking',
    label: 'Read the citation tracking guide',
  },
  '/platform/site-health': { href: '/platform/ai-visibility', label: 'Explore AI Visibility' },
  '/platform/commerce-intelligence': {
    href: '/platform/ai-visibility',
    label: 'Explore AI Visibility',
  },
  '/platform/demand-intelligence': {
    href: '/platform/search-intelligence',
    label: 'Explore Search Intelligence',
  },
  '/platform/ai-referral-analytics': { href: '/contact', label: 'Discuss GA4 setup' },
  '/platform/search-intelligence': { href: '/contact', label: 'Discuss setup' },
};

export function PlatformActions({
  path,
  closing = false,
}: Readonly<{ path: string; closing?: boolean }>) {
  const trial = path === '/' || path === '/platform' || path === '/platform/ai-visibility';
  const secondary =
    closing && path === '/platform/agents'
      ? { href: '/platform/content-intelligence', label: 'Explore Content Intelligence' }
      : closing && path === '/platform/content-intelligence'
        ? { href: '/platform/agents', label: 'Explore the AI Agent' }
        : (SECONDARY_ACTIONS[path] ?? { href: '/platform', label: 'Explore the platform' });
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {trial && selfServeSignupOpen() && (
        <ButtonLink href={appHref('/register')}>Start free trial</ButtonLink>
      )}
      {path === '/platform/mcp' && (
        <ButtonLink href={docsHref('/mcp/')}>Read setup guide</ButtonLink>
      )}
      <DemoButtonLink
        variant={(trial && selfServeSignupOpen()) || path === '/platform/mcp' ? 'soft' : 'primary'}
      >
        {path === '/platform/integrations' ? 'Discuss setup' : 'Book a demo'}
      </DemoButtonLink>
      {!trial && path !== '/platform/mcp' && (
        <ButtonLink href={secondary.href} variant="soft">
          {secondary.label}
        </ButtonLink>
      )}
    </div>
  );
}

export function PlatformCards() {
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {PLATFORM_GROUPS.map((group) => (
        <div key={group.label} className="space-y-5">
          <h3 className="website-feature-heading">{group.label}</h3>
          {group.items.map((item) => (
            <Card key={item.href} className="space-y-3 p-6">
              <a
                href={item.href}
                className="website-feature-heading text-accent-text underline-offset-4 hover:underline"
                data-marketing-cta=""
              >
                {item.title}
              </a>
              <p className="website-body text-muted">{item.desc}</p>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

function Copy({ text }: Readonly<{ text: string }>) {
  return (
    <>
      {text
        .split(/(\*\*.*?\*\*)/g)
        .map((part, index) =>
          part.startsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part,
        )}
    </>
  );
}

export function ProductModule({
  path,
  heading,
  children,
}: Readonly<{ path: string; heading: string; children: ReactNode }>) {
  return (
    <Section tone="sunken">
      <SectionHeader title={heading} />
      <p className="website-body-lg text-secondary max-w-3xl">{children}</p>
      <a className="website-body-lg text-accent-text underline underline-offset-4" href={path}>
        Explore {platformLabel(path)}
      </a>
    </Section>
  );
}

/** Product narratives remain distinct from the retained research/measurement pages. */
export function PlatformPageContent({ page }: Readonly<{ page: PlatformPage }>) {
  const overview = page.path === PLATFORM_OVERVIEW.href;
  const advanced =
    page.path === '/platform/agents' || page.path === '/platform/content-intelligence';
  return (
    <>
      <PageHero
        eyebrow={platformLabel(page.path) ?? 'Platform'}
        title={page.heading}
        lead={page.lead}
        centered
      >
        <div className="mt-8 space-y-5" data-cta-placement="hero">
          <PlatformActions path={page.path} />
          {(overview || page.path === '/platform/ai-visibility') && (
            <p className="website-body text-muted">{TRIAL_NOTE}</p>
          )}
          {advanced && (
            <p className="website-body text-muted">
              Agent workflows are not included in the current public trial. Book a demo to discuss
              access.
            </p>
          )}
        </div>
      </PageHero>
      <Section aria-label="Product preview">
        <SectionHeader
          title={overview ? 'Start with the answer evidence' : `Inside ${platformLabel(page.path)}`}
        />
        <PlatformPreview path={overview ? '/platform/ai-visibility' : page.path} />
      </Section>
      {page.sections.map((section, index) => (
        <Section key={section.heading} tone={index % 2 === 0 ? 'sunken' : 'paper'}>
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <SectionHeader title={section.heading} />
            <div className="space-y-5">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="website-body-lg text-secondary max-w-3xl">
                  <Copy text={paragraph} />
                </p>
              ))}
            </div>
          </div>
          {overview && index === 1 && <PlatformPreview path="/platform/site-health" />}
          {overview && index === 2 && <PlatformPreview path="/platform/agents" />}
        </Section>
      ))}
      {page.workflow && (
        <Section>
          <SectionHeader title="A workflow your team can review" />
          <p className="website-lead text-secondary">{page.workflow}</p>
        </Section>
      )}
      {page.examples && (
        <Section>
          <SectionHeader title="Start with a focused question" />
          <p className="website-body-lg text-secondary">{page.examples}</p>
        </Section>
      )}
      {overview && (
        <Section id="capabilities">
          <SectionHeader title="Explore the platform" />
          <PlatformCards />
        </Section>
      )}
      <Section tone="sunken">
        <SectionHeader title="Frequently asked questions" />
        <div className="grid gap-8 md:grid-cols-2">
          {page.faqs.map((faq) => (
            <div key={faq.q} className="space-y-3">
              <h3 className="website-feature-heading">{faq.q}</h3>
              <p className="website-body-lg text-muted">{faq.a}</p>
            </div>
          ))}
        </div>
      </Section>
      {page.related.length > 0 && (
        <Section aria-label="Related capabilities and guides">
          <SectionHeader title="Continue your investigation" />
          <ul className="grid gap-4 md:grid-cols-2">
            {page.related.map((href) => {
              const label = platformLabel(href) ?? GUIDE_LABELS[href];
              return label ? (
                <li key={href}>
                  <a
                    className="website-body-lg text-accent-text underline underline-offset-4"
                    href={href}
                  >
                    {label}
                  </a>
                </li>
              ) : null;
            })}
          </ul>
          {page.path === '/platform/mcp' && (
            <a className="website-body-lg text-accent-text underline" href={docsHref('/mcp/')}>
              MCP setup and tool reference
            </a>
          )}
        </Section>
      )}
      <Section className="marketing-closing-band">
        <div className="mx-auto max-w-3xl space-y-8 text-center" data-cta-placement="closing">
          <SectionHeader title={page.closing} />
          <PlatformActions path={page.path} closing />
        </div>
      </Section>
    </>
  );
}
