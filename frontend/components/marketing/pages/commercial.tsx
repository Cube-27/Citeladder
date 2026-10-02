import type { CommercialPage } from '@/lib/marketing-content/commercial-pages';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';

export function CommercialEntryPage({ page }: Readonly<{ page: CommercialPage }>) {
  return (
    <>
      <PageHero eyebrow={page.eyebrow} title={page.heading} lead={page.introduction}>
        <div className="mt-8 flex flex-wrap gap-4" data-cta-placement="hero">
          <DemoButtonLink />
          <ButtonLink href={page.secondary.href} variant="soft">
            {page.secondary.label}
          </ButtonLink>
        </div>
      </PageHero>
      {page.sections.map((section, index) => (
        <Section key={section.heading} tone={index % 2 === 0 ? 'paper' : 'sunken'} rhythm="tight">
          <div className="max-w-3xl space-y-5">
            <SectionHeader title={section.heading} />
            {section.paragraphs.map((paragraph) => (
              <p className="website-body-lg text-muted" key={paragraph}>
                {paragraph}
              </p>
            ))}
            {section.questions?.map((question) => (
              <div key={question.heading} className="space-y-3">
                <h3 className="website-feature-heading text-foreground">{question.heading}</h3>
                <p className="website-body-lg text-muted">{question.body}</p>
              </div>
            ))}
            {section.note && (
              <p className="website-body text-muted">
                <em>{section.note}</em>
              </p>
            )}
          </div>
        </Section>
      ))}
      <Section rhythm="tight">
        <div className="max-w-3xl space-y-5">
          <SectionHeader title={page.contextHeading} />
          <p className="website-body-lg text-muted">{page.context}</p>
          <ul className="website-body flex flex-wrap gap-x-5 gap-y-2" aria-label="Related pages">
            {page.related.map((link) => (
              <li key={link.href}>
                <a className="text-accent-text underline" href={link.href}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Section>
      <Section tone="sunken" rhythm="tight">
        <div className="max-w-3xl space-y-5">
          <SectionHeader title="Frequently asked questions" />
          {page.faqs.map((faq) => (
            <details key={faq.q} className="border-border-subtle border-b py-4">
              <summary className="website-feature-heading text-foreground cursor-pointer">
                {faq.q}
              </summary>
              <p className="website-body-lg text-muted mt-4">{faq.a}</p>
            </details>
          ))}
        </div>
      </Section>
      <Section className="marketing-closing-band" aria-label="Get started">
        <div className="max-w-3xl space-y-5" data-cta-placement="closing">
          <SectionHeader title={page.closingHeading} lead={page.closing} />
          <DemoButtonLink />
        </div>
      </Section>
    </>
  );
}
