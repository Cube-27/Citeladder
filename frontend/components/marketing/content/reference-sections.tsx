import { Fragment } from 'react';

import { FactList } from '@/components/ui/facts';
import { Tag } from '@/components/ui/tag';
import {
  AI_INSTRUCTIONS,
  REFERENCE_ENTITIES,
  type ReferenceSection,
} from '@/lib/marketing-content/ai-reference';

function Sources({ links }: Readonly<{ links: ReferenceSection['sources'] }>) {
  return (
    <p className="cl-ref-sources">
      <span className="cl-ref-sources-label">Official sources</span>
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </p>
  );
}

export function AiInstructionSections() {
  return (
    <>
      {AI_INSTRUCTIONS.map((section) => (
        <Fragment key={section.id}>
          <h2 id={section.id}>{section.title}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.facts && (
            <FactList
              layout="ruled"
              facts={section.facts.map((fact) => ({
                key: fact.label,
                label: fact.label,
                value: fact.href ? <a href={fact.href}>{fact.value}</a> : fact.value,
              }))}
            />
          )}
          {section.bullets && (
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
          <Sources links={section.sources} />
        </Fragment>
      ))}
    </>
  );
}

export function EntitySections() {
  return (
    <>
      {REFERENCE_ENTITIES.map((entity) => (
        <Fragment key={entity.id}>
          <h2 id={entity.id}>{entity.name}</h2>
          <p>
            <Tag>{entity.kind}</Tag>
          </p>
          <p>{entity.description}</p>
          <FactList
            layout="ruled"
            facts={entity.relations.map((relation) => ({
              key: `${relation.label}-${relation.target.href}`,
              label: relation.label,
              value: <a href={relation.target.href}>{relation.target.label}</a>,
            }))}
          />
          <Sources links={entity.sources} />
        </Fragment>
      ))}
    </>
  );
}
