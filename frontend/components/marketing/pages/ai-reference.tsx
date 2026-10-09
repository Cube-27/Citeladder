import type { ReactNode } from 'react';

import {
  AI_INSTRUCTIONS,
  AI_REFERENCE_UPDATED,
  REFERENCE_ENTITIES,
} from '@/lib/marketing-content/ai-reference';

import { PageHero } from '../primitives/page-hero';
import { Container } from '../primitives/section';

const REFERENCES = [
  { title: 'AI Instructions', href: '/ai-instructions' },
  { title: 'Entity Map', href: '/entity-map' },
] as const;

type ReferenceTitle = (typeof REFERENCES)[number]['title'];

/** A reference document: title, date and sibling switch, then rail + column. */
function ReferencePage({
  title,
  description,
  sections,
  children,
}: Readonly<{
  title: ReferenceTitle;
  description: string;
  sections: readonly { id: string; title: string }[];
  children: ReactNode;
}>) {
  return (
    <main id="main">
      <PageHero title={title} lead={description}>
        <div className="ed-doc-meta website-label">
          <span className="text-muted tabular-nums">
            Last updated · <time dateTime={AI_REFERENCE_UPDATED}>{AI_REFERENCE_UPDATED}</time>
          </span>
          <nav aria-label="Company references" className="flex flex-wrap gap-x-5 gap-y-1">
            {REFERENCES.map((reference) => (
              <a
                key={reference.href}
                href={reference.href}
                aria-current={reference.title === title ? 'page' : undefined}
              >
                {reference.title}
              </a>
            ))}
          </nav>
        </div>
      </PageHero>
      <div className="border-border-subtle border-t">
        <Container className="py-[calc(var(--section-y)*0.75)]">
          <div className="ed-doc">
            <nav aria-label="On this page" className="ed-rail">
              <p className="website-label ed-rail-title">On this page</p>
              <ol>
                {sections.map((section) => (
                  <li key={section.id}>
                    <a className="website-label" href={`#${section.id}`}>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <article className="ed-prose">{children}</article>
          </div>
        </Container>
      </div>
    </main>
  );
}

function Sources({ links }: Readonly<{ links: readonly { label: string; href: string }[] }>) {
  return (
    <div className="ed-sources website-body">
      <span className="website-label text-muted">Official sources</span>
      {links.map((link) => (
        <a key={link.href} href={link.href} className="ed-link">
          {link.label}
        </a>
      ))}
    </div>
  );
}

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
          className="ed-prose-section"
          aria-labelledby={`${section.id}-heading`}
        >
          <h2 id={`${section.id}-heading`} className="website-feature-heading ed-h2">
            {section.title}
          </h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="website-body">
              {paragraph}
            </p>
          ))}
          {section.facts && (
            <dl className="ed-facts website-body">
              {section.facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-foreground">{fact.label}</dt>
                  <dd className="text-muted">
                    {fact.href ? (
                      <a href={fact.href} className="ed-link">
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
            <ul className="ed-bullets website-body">
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
          className="ed-prose-section"
          aria-labelledby={`${entity.id}-heading`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id={`${entity.id}-heading`} className="website-feature-heading ed-h2">
              {entity.name}
            </h2>
            <span className="ed-kind website-label text-muted">{entity.kind}</span>
          </div>
          <p className="website-body">{entity.description}</p>
          <dl className="ed-facts website-body">
            {entity.relations.map((relation) => (
              <div key={`${relation.label}-${relation.target.href}`}>
                <dt className="text-muted">{relation.label}</dt>
                <dd>
                  <a href={relation.target.href} className="ed-link">
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
