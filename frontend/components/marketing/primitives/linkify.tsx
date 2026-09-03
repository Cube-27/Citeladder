import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Renders a plain content string with its URLs and internal paths as real
 * links.
 *
 * The marketing content modules hold prose as plain strings — that is what
 * keeps them editable and testable without JSX. The cost is that a destination
 * written into a sentence ("see /pricing", "the Cube27 Privacy Policy at
 * https://…") renders as dead text: the reader is told exactly where to go and
 * then has to retype it. This is the one transform that fixes that, shared by
 * the FAQ answers and the legal documents so both behave the same way.
 *
 * Internal paths are matched narrowly — a leading slash, then lowercase word
 * segments — so ordinary prose containing a slash, like "and/or", is left
 * alone.
 */
const INLINE_TOKEN_RE = /https?:\/\/\S+|\/[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*/g;

/** Sentence punctuation straight after a URL belongs to the prose, not the href. */
const TRAILING_PUNCT_RE = /[.,;:!?)]+$/;

const LINK = 'text-accent-text underline underline-offset-2';

export function Linkify({ text }: Readonly<{ text: string }>) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const token = match[0];
    const start = match.index;
    if (start > cursor) nodes.push(text.slice(cursor, start));

    const trailing = TRAILING_PUNCT_RE.exec(token)?.[0] ?? '';
    const href = trailing ? token.slice(0, -trailing.length) : token;
    // Internal paths stay in this tab and route through the client router;
    // only an absolute URL leaves the site and needs the new-tab treatment.
    nodes.push(
      href.startsWith('/') ? (
        <Link key={key} href={href} className={LINK}>
          {href}
        </Link>
      ) : (
        <a key={key} href={href} target="_blank" rel="noreferrer" className={LINK}>
          {href}
        </a>
      ),
    );
    key += 1;
    if (trailing) nodes.push(trailing);
    cursor = start + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}
