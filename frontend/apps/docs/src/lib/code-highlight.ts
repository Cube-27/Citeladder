/**
 * A small deterministic highlighter for the API examples: it splits a JSON,
 * shell, JavaScript or Python sample into coloured tokens at build time, so the
 * docs ship no highlighting library or client script. It only colours: the
 * tokens' text, joined, is always the input.
 */
export type CodeLanguage = 'json' | 'shell' | 'javascript' | 'python';
export type CodeTokenKind = 'key' | 'string' | 'number' | 'literal' | 'keyword' | 'comment';
export type CodeToken = { kind: CodeTokenKind | null; text: string };

const KEYWORDS: Record<CodeLanguage, ReadonlySet<string>> = {
  json: new Set(),
  shell: new Set(['curl']),
  javascript: new Set(['const', 'let', 'await', 'async', 'new', 'return', 'import', 'from']),
  python: new Set(['import', 'from', 'as', 'def', 'return']),
};
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'True', 'False', 'None']);

const COMMENT: Record<CodeLanguage, string> = {
  json: '(?!)',
  shell: '(?<=^|\\s)#[^\\n]*',
  javascript: '\\/\\/[^\\n]*',
  python: '#[^\\n]*',
};
// Shell single quotes have no escapes; the other languages escape with a backslash.
const SINGLE_QUOTED: Record<CodeLanguage, string> = {
  json: '(?!)',
  shell: "'[^']*'",
  javascript: "'(?:[^'\\\\\\n]|\\\\.)*'",
  python: "'(?:[^'\\\\\\n]|\\\\.)*'",
};

function pattern(language: CodeLanguage): RegExp {
  return new RegExp(
    [
      `(?<comment>${COMMENT[language]})`,
      `(?<string>"(?:[^"\\\\\\n]|\\\\.)*"|${SINGLE_QUOTED[language]})`,
      '(?<number>-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)',
      '(?<word>[A-Za-z_$][\\w$]*)',
    ].join('|'),
    'gu',
  );
}

/** A string or bare word directly followed by a colon is an object key. */
const isKey = (code: string, end: number) => /^[ \t]*:/u.test(code.slice(end, end + 8));

export function highlightCode(code: string, language: CodeLanguage): CodeToken[] {
  const tokens: CodeToken[] = [];
  const push = (kind: CodeToken['kind'], text: string) => {
    const last = tokens.at(-1);
    if (kind === null && last?.kind === null) last.text += text;
    else tokens.push({ kind, text });
  };
  let cursor = 0;
  for (const match of code.matchAll(pattern(language))) {
    const groups = match.groups ?? {};
    const end = match.index + match[0].length;
    if (match.index > cursor) push(null, code.slice(cursor, match.index));
    cursor = end;
    if (groups.comment) push('comment', match[0]);
    else if (groups.string) push(isKey(code, end) ? 'key' : 'string', match[0]);
    else if (groups.number) push('number', match[0]);
    else if (LITERALS.has(match[0])) push('literal', match[0]);
    else if (KEYWORDS[language].has(match[0])) push('keyword', match[0]);
    else if (language === 'javascript' && isKey(code, end)) push('key', match[0]);
    else push(null, match[0]);
  }
  if (cursor < code.length) push(null, code.slice(cursor));
  return tokens;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (text: string) => text.replaceAll(/[&<>"]/gu, (char) => ESCAPES[char] ?? char);

/** The sample as escaped HTML, each coloured token in a `cl-tok-<kind>` span. */
export function highlightHtml(code: string, language: CodeLanguage): string {
  return highlightCode(code, language)
    .map(({ kind, text }) =>
      kind ? `<span class="cl-tok-${kind}">${escape(text)}</span>` : escape(text),
    )
    .join('');
}
