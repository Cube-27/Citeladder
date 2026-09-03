import { Plus } from 'lucide-react';

import { FAQ_GROUPS, type FaqGroup } from '@/lib/marketing-content/faq';

import { Meta } from '../primitives/label';
import { Linkify } from '../primitives/linkify';
import { Container } from '../primitives/section';

/**
 * FAQ body (`/faq`) — a sticky group rail beside the four question groups.
 *
 * The accordion is native <details>/<summary> on purpose: it keeps the page a
 * sync RSC with zero client JS, and it stays keyboard- and search-accessible
 * without any of the ARIA a hand-rolled accordion would need.
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
    <Container className="grid gap-10 pb-30 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
      <nav aria-label="FAQ groups" className="lg:sticky lg:top-28 lg:self-start">
        <Meta as="p" className="mb-5">
          On this page
        </Meta>
        <div className="grid gap-2">
          {FAQ_GROUPS.map((group) => (
            <a
              key={group.heading}
              href={`#${groupAnchor(group)}`}
              className="text-muted hover:bg-panel hover:text-foreground flex items-center justify-between gap-4 rounded-[var(--radius-control)] px-4 py-3 text-sm transition-colors duration-200"
            >
              {group.heading}
              <span className="text-muted font-mono text-xs tabular-nums">
                {group.items.length}
              </span>
            </a>
          ))}
        </div>
      </nav>

      <div className="grid gap-12">
        {FAQ_GROUPS.map((group) => (
          <section key={group.heading} id={groupAnchor(group)} aria-label={group.heading}>
            <div className="border-border-subtle mb-3 flex items-baseline justify-between gap-5 border-b pb-5">
              <h2 className="website-section-heading text-foreground">{group.heading}</h2>
              <Meta>{group.items.length} answers</Meta>
            </div>
            {group.items.map((item) => (
              <details
                key={item.q}
                name="citeladder-faq"
                className="border-border-subtle group border-b"
              >
                <summary className="text-foreground hover:text-accent-text flex cursor-pointer list-none items-center justify-between gap-8 py-5 text-base font-medium transition-colors [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus
                    aria-hidden
                    className="text-muted size-4 shrink-0 transition-transform duration-300 group-open:rotate-45"
                  />
                </summary>
                <p className="website-body-lg text-muted max-w-[75ch] pb-8">
                  <Linkify text={item.a} />
                </p>
              </details>
            ))}
          </section>
        ))}
      </div>
    </Container>
  );
}
