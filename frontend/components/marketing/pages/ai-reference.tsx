import type { ReactNode } from 'react';

import {
  AI_INSTRUCTIONS,
  AI_REFERENCE_UPDATED,
  REFERENCE_ENTITIES,
} from '@/lib/marketing-content/ai-reference';

import { Section } from '../primitives/section';

const REFERENCE_LINK = 'text-accent-text hover:text-accent-hover underline underline-offset-4';

function ReferencePage({
  title,
  description,
  sections,
  children,
}: Readonly<{
  title: string;
  description: string;
  sections: readonly { id: string; title: string }[];
  children: ReactNode;
}>) {
  return (
    <main id="main">
      <header className="border-border-subtle border-b pt-16 pb-8">
        <div className="mx-auto w-full max-w-5xl px-[var(--site-gutter)]">
          <p className="website-eyebrow text-muted">Company reference</p>
          <h1 className="website-page-title mt-3">{title}</h1>
          <p className="website-body-lg text-muted mt-4 max-w-[65ch]">{description}</p>
          <p className="website-label mt-5">
            Last updated · <time dateTime={AI_REFERENCE_UPDATED}>3 October 2026</time>
          </p>
          <nav
            aria-label="Company references"
            className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm"
          >
            <a
              href="/ai-instructions"
              className={REFERENCE_LINK}
              aria-current={title === 'AI Instructions' ? 'page' : undefined}
            >
              AI Instructions
            </a>
            <a
              href="/entity-map"
              className={REFERENCE_LINK}
              aria-current={title === 'Entity Map' ? 'page' : undefined}
            >
              Entity Map
            </a>
          </nav>
        </div>
      </header>
      <Section rhythm="tight" dense>
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <p className="website-eyebrow mb-3">On this page</p>
            <ol className="grid gap-2">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-muted hover:text-foreground text-sm">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="min-w-0">{children}</article>
        </div>
      </Section>
    </main>
  );
}

function Sources({ links }: Readonly<{ links: readonly { label: string; href: string }[] }>) {
  return (
    <div className="mt-5">
      <p className="website-label">Official sources</p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} className={REFERENCE_LINK}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const REFERENCE_SECTION =
  'border-border-subtle scroll-mt-28 border-b py-8 first:pt-0 last:border-b-0';

export function AiInstructionsPage() {
  return (
    <ReferencePage
      title="AI Instructions"
      description="First-party facts about CiteLadder for AI assistants, researchers, and anyone describing the product. Use the linked sources to check details and keep observations separate from claims."
      sections={AI_INSTRUCTIONS}
    >
      {AI_INSTRUCTIONS.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className={REFERENCE_SECTION}
          aria-labelledby={`${section.id}-heading`}
        >
          <h2 id={`${section.id}-heading`} className="website-feature-heading">
            {section.title}
          </h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="website-body-lg mt-4">
              {paragraph}
            </p>
          ))}
          {section.facts && (
            <dl className="border-border-subtle mt-5 divide-y divide-[var(--color-border-subtle)] border-y">
              {section.facts.map((fact) => (
                <div
                  key={fact.label}
                  className="grid gap-1 py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
                >
                  <dt className="font-medium">{fact.label}</dt>
                  <dd className="text-muted break-words">
                    {fact.href ? (
                      <a href={fact.href} className={REFERENCE_LINK}>
                        {fact.value}
                      </a>
                    ) : (
                      fact.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {section.bullets && (
            <ul className="website-body-lg mt-4 grid list-disc gap-3 pl-5">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
          <Sources links={section.sources} />
        </section>
      ))}
    </ReferencePage>
  );
}

export function EntityMapPage() {
  return (
    <ReferencePage
      title="Entity Map"
      description="A linked reference to CiteLadder, the company behind it, its people, product capabilities, and related concepts. These definitions reflect CiteLadder’s own published information; each entry links to its source."
      sections={REFERENCE_ENTITIES.map((entity) => ({ id: entity.id, title: entity.name }))}
    >
      {REFERENCE_ENTITIES.map((entity) => (
        <section
          key={entity.id}
          id={entity.id}
          className={REFERENCE_SECTION}
          aria-labelledby={`${entity.id}-heading`}
        >
          <p className="website-eyebrow mb-2">{entity.kind}</p>
          <h2 id={`${entity.id}-heading`} className="website-feature-heading">
            {entity.name}
          </h2>
          <p className="website-body-lg mt-4">{entity.description}</p>
          <dl className="mt-5 grid gap-3 text-sm">
            {entity.relations.map((relation) => (
              <div
                key={`${relation.label}-${relation.target.href}`}
                className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
              >
                <dt className="text-muted">{relation.label}</dt>
                <dd>
                  <a href={relation.target.href} className={REFERENCE_LINK}>
                    {relation.target.label}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
          <Sources links={entity.sources} />
        </section>
      ))}
    </ReferencePage>
  );
}
