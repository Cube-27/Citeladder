import {
  FOOTER_LEGAL_LINKS,
  LEGAL_ENTITY,
  type LegalDocument,
} from '@/lib/marketing-content/legal';
import { cn } from '@/lib/utils';

import { Linkify } from '../primitives/linkify';
import { PageHero } from '../primitives/page-hero';
import { Container } from '../primitives/section';

const UPDATED_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatUpdated(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return UPDATED_DATE_FORMATTER.format(date);
}

/** Policies with fewer sections read without a contents rail. */
const RAIL_MIN_SECTIONS = 4;

/**
 * Shared legal document layout: the page title and date, then one measured
 * reading column with a sticky contents rail on desktop for long policies.
 * Design only — every string comes verbatim from the legal content modules.
 */
export function LegalDocumentView({ document }: Readonly<{ document: LegalDocument }>) {
  const updated = document.lastUpdated ?? LEGAL_ENTITY.lastUpdated;
  const rail = document.sections.length >= RAIL_MIN_SECTIONS;
  return (
    <main id="main">
      <PageHero title={document.title} lead={document.description}>
        <p className="website-label text-muted mt-6 tabular-nums">
          Last updated · <time dateTime={updated}>{formatUpdated(updated)}</time>
        </p>
      </PageHero>

      <div className="border-border-subtle border-t">
        <Container className="py-[calc(var(--section-y)*0.75)]">
          <div className={cn('ed-doc', !rail && 'ed-doc-single')}>
            {rail && (
              <nav aria-label="On this page" className="ed-rail">
                <p className="website-label ed-rail-title">On this page</p>
                <ol>
                  {document.sections.map((section) => (
                    <li key={section.id}>
                      <a className="website-label" href={`#${section.id}`}>
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <article className="ed-prose">
              {document.sections.map((section) => (
                <section key={section.id} id={section.id} className="ed-prose-section">
                  <h2 className="website-feature-heading ed-h2">{section.title}</h2>
                  {/* Policy text names sibling policies by path; Linkify keeps
                      those references navigable. */}
                  {section.paragraphs?.map((paragraph, index) => (
                    <p key={`${section.id}-p-${index}`} className="website-body">
                      <Linkify text={paragraph} />
                    </p>
                  ))}
                  {section.bullets && section.bullets.length > 0 ? (
                    <ul className="ed-bullets website-body">
                      {section.bullets.map((item, index) => (
                        <li key={`${section.id}-b-${index}`}>
                          <Linkify text={item} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {section.table ? (
                    <div className="ed-table-wrap">
                      <table className="ed-table website-body min-w-[34rem]">
                        <caption className="sr-only">{section.table.caption}</caption>
                        <thead>
                          <tr>
                            {section.table.headings.map((heading) => (
                              <th key={heading} scope="col">
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.table.rows.map(([header, ...cells]) => (
                            <tr key={header}>
                              <th scope="row" className="break-words">
                                {header}
                              </th>
                              {cells.map((cell, index) => (
                                <td key={`${header}-${index}`}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {section.note ? <p className="ed-note website-body">{section.note}</p> : null}
                </section>
              ))}

              <nav aria-label="Other legal documents" className="ed-doc-footer">
                {FOOTER_LEGAL_LINKS.filter((link) => link.href !== `/${document.slug}`).map(
                  (link) => (
                    <a key={link.href} href={link.href} className="ed-link website-body">
                      {link.label}
                    </a>
                  ),
                )}
              </nav>
            </article>
          </div>
        </Container>
      </div>
    </main>
  );
}
