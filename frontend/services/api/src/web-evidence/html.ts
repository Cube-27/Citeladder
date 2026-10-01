/** One parsed HTML tree shared by discovery and bounded evidence extraction. */
import { parse, type DefaultTreeAdapterTypes } from 'parse5';

export type HtmlNode = DefaultTreeAdapterTypes.Node;
export type HtmlElement = DefaultTreeAdapterTypes.Element;
const excluded = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe']);
export function document(body: Buffer, charset = 'utf-8') {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset || 'utf-8');
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  return parse(decoder.decode(body));
}
export function* elements(root: HtmlNode, tag?: string): Generator<HtmlElement> {
  const pending: HtmlNode[] = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if ('tagName' in node && (!tag || node.tagName === tag)) yield node;
    if ('childNodes' in node) pending.push(...node.childNodes.toReversed());
  }
}
export const attribute = (node: HtmlElement, name: string) =>
  node.attrs.find((a) => a.name === name)?.value ?? '';
export function visibleText(root: HtmlNode, prune = true): string {
  const fragments: string[] = [];
  const pending: HtmlNode[] = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if ('tagName' in node && prune && excluded.has(node.tagName)) continue;
    if ('value' in node && node.nodeName === '#text') fragments.push(node.value);
    if ('childNodes' in node) pending.push(...node.childNodes.toReversed());
  }
  return fragments.join(' ').replaceAll(/\s+/gu, ' ').trim();
}
