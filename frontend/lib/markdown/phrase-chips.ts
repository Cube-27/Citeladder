/**
 * A rehype step that turns exact phrases into chip slots: a `span` whose
 * `data-chip` names the phrase's index, which the renderer fills. Like the
 * highlights, it only splits text nodes, so it adds no HTML from the input; a
 * phrase inside a link or code, across formatting, or inside a longer word
 * stays text.
 */
type Text = { type: 'text'; value: string };
type Element = {
  type: 'element';
  tagName: string;
  properties: Record<string, unknown>;
  children: Node[];
};
type Node = Text | Element | { type: string; children?: Node[] };

const SKIPPED = new Set(['a', 'code', 'pre']);
const WORD = /[\p{L}\p{N}]/u;

function isText(node: Node): node is Text {
  return node.type === 'text' && 'value' in node;
}

/** Where `phrase` first stands alone in `value`, not inside a longer word; -1 when nowhere. */
function standalone(value: string, phrase: string): number {
  for (let at = value.indexOf(phrase); at !== -1; at = value.indexOf(phrase, at + 1)) {
    const before = value[at - 1] ?? '';
    const after = value[at + phrase.length] ?? '';
    if (!WORD.test(before) && !WORD.test(after)) return at;
  }
  return -1;
}

/** The text split around the earliest phrase (the longest where two start together), recursively. */
function splitText(value: string, phrases: readonly string[]): Node[] {
  let best: { at: number; index: number; phrase: string } | null = null;
  for (const [index, phrase] of phrases.entries()) {
    if (!phrase.trim()) continue;
    const at = standalone(value, phrase);
    if (at === -1) continue;
    if (best === null || at < best.at || (at === best.at && phrase.length > best.phrase.length))
      best = { at, index, phrase };
  }
  if (best === null) return value ? [{ type: 'text', value }] : [];
  const { at, index, phrase } = best;
  return [
    ...(at ? [{ type: 'text', value: value.slice(0, at) } satisfies Text] : []),
    {
      type: 'element',
      tagName: 'span',
      properties: { dataChip: String(index) },
      children: [{ type: 'text', value: phrase }],
    } satisfies Element,
    ...splitText(value.slice(at + phrase.length), phrases),
  ];
}

function walk(node: Node, phrases: readonly string[]): void {
  if (!('children' in node) || !node.children) return;
  if ('tagName' in node && SKIPPED.has(node.tagName)) return;
  node.children = node.children.flatMap((child) => {
    if (isText(child)) return splitText(child.value, phrases);
    walk(child, phrases);
    return [child];
  });
}

/** Marks each phrase by its index in `phrases`; blank phrases never match. */
export function phraseChipsPlugin(phrases: readonly string[]) {
  return () => (tree: Node) => walk(tree, phrases);
}
