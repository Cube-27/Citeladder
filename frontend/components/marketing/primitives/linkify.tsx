import type { ReactNode } from 'react';

const INLINE_TOKEN_RE = /https?:\/\/\S+|(?<![\w/])\/[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*/g; // NOSONAR

const TRAILING_PUNCT = new Set(['.', ',', ';', ':', '!', '?', ')']);

function trailingPunctuation(token: string): string {
  let end = token.length;
  while (end > 0 && TRAILING_PUNCT.has(token.charAt(end - 1))) end -= 1;
  return token.slice(end);
}

const LINK = 'text-ink underline decoration-line-control underline-offset-2';

export function Linkify({ text }: Readonly<{ text: string }>) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const token = match[0];
    const start = match.index;
    if (start > cursor) nodes.push(text.slice(cursor, start));

    const trailing = trailingPunctuation(token);
    const href = trailing ? token.slice(0, -trailing.length) : token;
    nodes.push(
      href.startsWith('/') ? (
        <a key={key} href={href} className={LINK}>
          {href}
        </a>
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
