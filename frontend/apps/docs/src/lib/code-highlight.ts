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
  shell: String.raw`(?<=^|\s)#[^\n]*`,
  javascript: String.raw`\/\/[^\n]*`,
  python: String.raw`#[^\n]*`,
};
// Shell single quotes have no escapes: an apostrophe is written '\'' and the
// argument goes on. The other languages escape with a backslash.
const SINGLE_QUOTED: Record<CodeLanguage, string> = {
  json: '(?!)',
  shell: String.raw`'[^']*'(?:\\''[^']*')*`,
  javascript: String.raw`'(?:[^'\\\n]|\\.)*'`,
  python: String.raw`'(?:[^'\\\n]|\\.)*'`,
};

function pattern(language: CodeLanguage): RegExp {
  return new RegExp(
    [
      `(?<comment>${COMMENT[language]})`,
      String.raw`(?<string>"(?:[^"\\\n]|\\.)*"|${SINGLE_QUOTED[language]})`,
      String.raw`(?<number>-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)`,
      String.raw`(?<word>[A-Za-z_$][\w$]*)`,
    ].join('|'),
    'gu',
  );
}

/** A string or bare word directly followed by a colon is an object key. */
const isKey = (code: string, end: number) => /^[ \t]*:/u.test(code.slice(end, end + 8));

function kindOf(match: RegExpExecArray, code: string, language: CodeLanguage): CodeToken['kind'] {
  const text = match[0];
  const end = match.index + text.length;
  if (match.groups?.comment) return 'comment';
  if (match.groups?.string) return isKey(code, end) ? 'key' : 'string';
  if (match.groups?.number) return 'number';
  if (LITERALS.has(text)) return 'literal';
  if (KEYWORDS[language].has(text)) return 'keyword';
  return language === 'javascript' && isKey(code, end) ? 'key' : null;
}

export function highlightCode(code: string, language: CodeLanguage): CodeToken[] {
  const tokens: CodeToken[] = [];
  const push = (kind: CodeToken['kind'], text: string) => {
    const last = tokens.at(-1);
    if (kind === null && last?.kind === null) last.text += text;
    else tokens.push({ kind, text });
  };
  let cursor = 0;
  for (const match of code.matchAll(pattern(language))) {
    if (match.index > cursor) push(null, code.slice(cursor, match.index));
    push(kindOf(match, code, language), match[0]);
    cursor = match.index + match[0].length;
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
