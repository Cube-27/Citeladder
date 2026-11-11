/**
 * A bounded, redacted HTML reference snippet of one failing element with its
 * label context, so a fix can name the exact markup without the crawler
 * keeping raw HTML.
 *
 * The snippet keeps structure only: tags, attribute names, and the values of
 * the structural attributes configured in `reference_snippet_kept_attributes`
 * (never an email- or token-like one). Every other attribute value, all text,
 * comments, event handlers and script-like elements are removed, so the page's
 * copy and anything a visitor could have typed never reach it.
 */
import type { HtmlElement, HtmlNode } from '../../web-evidence/html.ts';
import { ancestors, parentElement } from '../../web-evidence/html.ts';
import { analysisPolicy, limits } from './policy.ts';

export type ReferenceSnippet = { html: string; truncated: boolean };

const KEPT = new Set(analysisPolicy.facts.reference_snippet_kept_attributes);
/** Elements whose content is code or embedded documents: dropped whole. */
const DROPPED = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed']);
/** Elements kept as an empty shell: their content is drawing data, not structure. */
const SHELLS = new Set(['svg', 'math']);
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const ATTRIBUTE_NAME = /^[a-z][a-z0-9_.:-]*$/iu;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
/** A long run mixing letters and digits: an id, hash, session or API token. */
const TOKEN = /(?=[\w+/=-]*\d)(?=[\w+/=-]*[a-z])[\w+/=-]{24,}/iu;
export const REDACTED = '[redacted]';
export const TEXT = '[text]';

const escapeValue = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

function attributeValue(name: string, value: string) {
  if (!KEPT.has(name) || EMAIL.test(value) || TOKEN.test(value)) return REDACTED;
  return escapeValue(Array.from(value).slice(0, limits.accessibility_identifier_chars).join(''));
}

function openTag(node: HtmlElement) {
  const parts = [node.tagName];
  for (const { name, value } of node.attrs) {
    const lower = name.toLowerCase();
    if (!ATTRIBUTE_NAME.test(name) || lower.startsWith('on')) continue;
    parts.push(value === '' ? lower : `${lower}="${attributeValue(lower, value)}"`);
  }
  return `<${parts.join(' ')}>`;
}

const isElement = (node: HtmlNode): node is HtmlElement => 'tagName' in node;

/**
 * The redacted markup of `root`, depth-first without recursion. It stops once
 * the markup passes `budget` characters, so a large context costs no more than
 * the cap.
 */
function serialize(root: HtmlElement, budget = Infinity) {
  let html = '';
  const pending: (HtmlNode | { close: string })[] = [root];
  while (pending.length && html.length <= budget) {
    const item = pending.pop()!;
    if ('close' in item) {
      html += item.close;
      continue;
    }
    if (item.nodeName === '#text') {
      if ('value' in item && item.value.trim()) html += TEXT;
      continue;
    }
    if (!isElement(item) || DROPPED.has(item.tagName)) continue;
    html += openTag(item);
    if (VOID.has(item.tagName)) continue;
    pending.push({ close: `</${item.tagName}>` });
    if (SHELLS.has(item.tagName)) continue;
    for (let index = item.childNodes.length - 1; index >= 0; index--)
      pending.push(item.childNodes[index]!);
  }
  return html;
}

/**
 * The control within its label context: the wrapping label, else its parent
 * element. When that exceeds `reference_snippet_chars` the control alone, and
 * when even that does, the control cut at the cap and marked truncated.
 */
export function referenceSnippet(control: HtmlElement): ReferenceSnippet {
  const cap = limits.reference_snippet_chars;
  const context = [...ancestors(control)].find((node) => node.tagName === 'label');
  const parent = context ?? parentElement(control);
  for (const candidate of parent ? [parent, control] : [control]) {
    const html = serialize(candidate, cap);
    if (html.length <= cap) return { html, truncated: false };
  }
  return { html: Array.from(serialize(control, cap)).slice(0, cap).join(''), truncated: true };
}
