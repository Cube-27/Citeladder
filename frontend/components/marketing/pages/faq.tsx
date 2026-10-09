import { ChevronDown } from 'lucide-react';

import { FAQ_GROUPS, type FaqGroup } from '@/lib/marketing-content/faq';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { Linkify } from '../primitives/linkify';
import { Section, SectionHeader } from '../primitives/section';

/**
 * FAQ body (`/faq`) — a sticky group index beside the question groups.
 *
 * The accordion is native <details>/<summary> (the shared `mk-faq-list`
 * pattern) on purpose: it keeps the page a sync server render with zero client
 * JS, and it stays keyboard- and search-accessible without any of the ARIA a
 * hand-rolled accordion would need. The FAQPage JSON-LD is built from the
 * same `FAQ_GROUPS` in faq.astro.
 */
const GROUP_ANCHORS: Record<string, string> = {
  Platform: 'faq-platform',
  'Site Health': 'faq-site-health',
  'Data & security': 'faq-security',
  'Account & billing': 'faq-billing',
};

function fallbackAnchor(heading: string): string {
  let anchor = '';
  let needsSeparator = false;
  for (const character of heading.toLowerCase()) {
    const isAsciiLetter = character >= 'a' && character <= 'z';
    const isDigit = character >= '0' && character <= '9';
    if (isAsciiLetter || isDigit) {
      if (needsSeparator && anchor) anchor += '-';
      anchor += character;
      needsSeparator = false;
    } else {
      needsSeparator = true;
    }
  }
  return anchor;
}

function groupAnchor(group: FaqGroup): string {
  return GROUP_ANCHORS[group.heading] ?? `faq-${fallbackAnchor(group.heading)}`;
}

export function FaqGroups() {
  return (
    <Section rhythm="tight" className="pt-0">
      <div className="cm-faq">
        <nav aria-label="FAQ groups" className="cm-faq-index">
          <ul>
            {FAQ_GROUPS.map((group) => (
              <li key={group.heading}>
                <a href={`#${groupAnchor(group)}`}>
                  <span>{group.heading}</span>
                  <span className="cm-faq-count">{group.items.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="cm-faq-groups">
          {FAQ_GROUPS.map((group) => (
            <section
              key={group.heading}
              id={groupAnchor(group)}
              aria-labelledby={`${groupAnchor(group)}-title`}
              className="cm-faq-group"
            >
              <h2
                id={`${groupAnchor(group)}-title`}
                className="website-feature-heading text-foreground"
              >
                {group.heading}
              </h2>
              <div className="mk-faq-list">
                {group.items.map((item) => (
                  <details key={item.q} name="citeladder-faq">
                    <summary>
                      <span className="text-balance">{item.q}</span>
                      <ChevronDown aria-hidden className="size-4" />
                    </summary>
                    <p className="website-body">
                      <Linkify text={item.a} />
                      {item.links?.map((link) => (
                        <span key={link.href}>
                          {' '}
                          <a
                            href={link.href}
                            className="text-accent-text underline underline-offset-2"
                          >
                            {link.label}
                          </a>
                        </span>
                      ))}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** Closing band for questions the page does not answer. */
export function FaqCta() {
  return (
    <Section className="marketing-closing-band" aria-label="Ask us directly">
      <div className="flex flex-col items-center gap-8 text-center" data-cta-placement="closing">
        <SectionHeader
          title="Still have a question?"
          lead="Ask us directly, or see the product on your own category."
          align="center"
        />
        <div className="flex flex-wrap justify-center gap-3">
          <DemoButtonLink size="marketing">Book a demo</DemoButtonLink>
          <ButtonLink href="/pricing" variant="soft" size="marketing">
            See pricing
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
