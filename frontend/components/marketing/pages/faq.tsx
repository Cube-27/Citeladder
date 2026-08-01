import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { FAQ_GROUPS, type FaqGroup } from '@/lib/marketing-content/faq';

import { Meta } from '../primitives/label';
import { Container } from '../primitives/section';

/**
 * FAQ body (`/faq`) — a sticky group rail beside the four question groups.
 *
 * The accordion is native <details>/<summary> on purpose: it keeps the page a
 * sync RSC with zero client JS, and it stays keyboard- and search-accessible
 * without any of the ARIA a hand-rolled accordion would need.
 */
const GROUP_ANCHORS: Record<string, string> = {
  Product: 'faq-product',
  'Privacy & keys': 'faq-privacy',
  'Site health': 'faq-site-health',
  'Account & billing': 'faq-billing',
};

function groupAnchor(group: FaqGroup): string {
  const fallback = group.heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return GROUP_ANCHORS[group.heading] ?? `faq-${fallback}`;
}

// Answers are plain strings from the content module. One inline transform
// keeps them faithful: bare URLs render as real links.
const INLINE_TOKEN_RE = /https?:\/\/\S+/g;
// Sentence punctuation straight after a URL belongs to the prose, not the href.
const TRAILING_PUNCT_RE = /[.,;:!?)]+$/;

function AnswerText({ text }: Readonly<{ text: string }>) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const token = match[0];
    const start = match.index;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const trailing = token.match(TRAILING_PUNCT_RE)?.[0] ?? '';
    const href = trailing ? token.slice(0, -trailing.length) : token;
    nodes.push(
      <a
        key={key}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-mkt-indigo underline underline-offset-2"
      >
        {href}
      </a>,
    );
    key += 1;
    if (trailing) nodes.push(trailing);
    cursor = start + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function FaqGroups() {
  return (
    <Container className="gap-mkt-40 pb-mkt-100 lg:gap-mkt-70 grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="FAQ groups" className="lg:sticky lg:top-28 lg:self-start">
        <Meta as="p" className="mb-mkt-20">
          On this page
        </Meta>
        <div className="gap-mkt-6 grid">
          {FAQ_GROUPS.map((group) => (
            <a
              key={group.heading}
              href={`#${groupAnchor(group)}`}
              className="text-mkt-sm text-mkt-ink-soft hover:bg-mkt-surface hover:text-mkt-ink gap-mkt-14 rounded-mkt-sm px-mkt-14 py-mkt-10 flex items-center justify-between transition-colors duration-200"
            >
              {group.heading}
              <span className="text-mkt-ink-soft text-mkt-xs font-mono tabular-nums">
                {group.items.length}
              </span>
            </a>
          ))}
        </div>
      </nav>

      <div className="gap-mkt-50 grid">
        {FAQ_GROUPS.map((group) => (
          <section key={group.heading} id={groupAnchor(group)} aria-label={group.heading}>
            <div className="border-mkt-black-10 mb-mkt-10 gap-mkt-20 pb-mkt-20 flex items-baseline justify-between border-b">
              <h2 className="font-mkt-display text-mkt-h4 text-mkt-ink">{group.heading}</h2>
              <Meta>{group.items.length} answers</Meta>
            </div>
            {group.items.map((item) => (
              <details key={item.q} className="border-mkt-black-10 group border-b">
                <summary className="text-mkt-body text-mkt-ink hover:text-mkt-indigo gap-mkt-30 py-mkt-20 flex cursor-pointer list-none items-center justify-between font-semibold transition-colors [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus
                    aria-hidden
                    className="text-mkt-ink-soft size-4 shrink-0 transition-transform duration-300 group-open:rotate-45"
                  />
                </summary>
                <p className="text-mkt-body text-mkt-ink-soft pb-mkt-30 max-w-[90ch]">
                  <AnswerText text={item.a} />
                </p>
              </details>
            ))}
          </section>
        ))}
      </div>
    </Container>
  );
}
