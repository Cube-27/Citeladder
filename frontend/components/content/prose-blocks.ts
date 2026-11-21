/**
 * Prose's Markdown blocks, for the docs (a Sätteri hast plugin) and the
 * website (a rehype plugin for react-markdown): fenced code becomes the
 * system's CodeBlock (a bar with the language and a Copy button over mono
 * code, comment lines and a leading `$ ` prompt in `ink-muted`, no other
 * syntax colours), and every table gets Prose's scroll frame. The markup's
 * styles and the Copy behaviour live in CodeBlock.astro, which Prose renders.
 */

import type { SatteriResolvedOptions } from '@astrojs/markdown-satteri';

// Sätteri's own plugin types, reached through the processor's options
// (Astro does not re-export them): one plugin definition, its element visitor
// and the hast element that visitor receives.
type PluginDefinition = Exclude<
  SatteriResolvedOptions['hastPlugins'][number],
  ((...args: never[]) => unknown) | readonly unknown[] | null | undefined | false
>;
type ElementVisitor = Exclude<NonNullable<PluginDefinition['element']>, readonly unknown[]>;
type Element = Parameters<ElementVisitor['visit']>[0];
type Child = Element['children'][number];
type Text = Extract<Child, { type: 'text' }>;

const text = (value: string): Text => ({ type: 'text', value });
const element = (
  tagName: string,
  properties: Element['properties'],
  children: Child[] = [],
): Element => ({ type: 'element', tagName, properties, children });

/** Comment lines and the shell prompt are muted; everything else stays ink. */
function codeLines(code: string): Child[] {
  const lines = code.replace(/\n$/, '').split('\n');
  return lines.flatMap((line, index) => {
    const trimmed = line.trim();
    let parts: Child[];
    if (trimmed.startsWith('#') || trimmed.startsWith('//'))
      parts = [element('span', { className: ['cl-code-muted'] }, [text(line)])];
    else if (line.startsWith('$ '))
      parts = [
        element('span', { className: ['cl-code-muted'] }, [text('$ ')]),
        text(line.slice(2)),
      ];
    else parts = [text(line)];
    return index < lines.length - 1 ? [...parts, text('\n')] : parts;
  });
}

// Lucide's copy and check glyphs, drawn at the system's 16px icon size.
const glyph = (name: 'copy' | 'check', children: Element[]) =>
  element(
    'svg',
    {
      className: [`cl-code-icon-${name}`],
      dataGlyph: name,
      width: 16,
      height: 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      ariaHidden: 'true',
    },
    children,
  );

/** The CodeBlock markup for one fence's source and language. */
function codeBlock(source: string, language: string | null): Element {
  return element('figure', { className: ['cl-code'] }, [
    element('figcaption', { className: ['cl-code-bar'] }, [
      ...(language ? [element('span', { className: ['cl-code-lang'] }, [text(language)])] : []),
      element('output', { className: ['cl-code-status'], dataCodeCopyStatus: '' }, []),
      // The block clips its corners and its code scrolls, so both rings draw inside.
      element(
        'button',
        { type: 'button', className: ['cl-code-copy', 'focus-ring-inset'], dataCodeCopy: '' },
        [
          glyph('copy', [
            element('rect', { width: 14, height: 14, x: '8', y: '8', rx: '2', ry: '2' }),
            element('path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }),
          ]),
          glyph('check', [element('path', { d: 'M20 6 9 17l-5-5' })]),
          text('Copy'),
        ],
      ),
    ]),
    element('pre', { className: ['cl-code-pre', 'focus-ring-inset'], tabIndex: 0 }, [
      element('code', {}, codeLines(source)),
    ]),
  ]);
}

function fenceLanguage(code: Element): string | null {
  const classes = code.properties.className;
  if (!Array.isArray(classes)) return null;
  const match = classes.map(String).find((name) => name.startsWith('language-'));
  return match ? match.slice('language-'.length) : null;
}

/** The Sätteri plugin, in the shape `satteri({ hastPlugins })` takes (the docs' Markdown). */
export const proseMarkdownBlocks = {
  name: 'prose-markdown-blocks',
  element: {
    filter: ['pre', 'table'],
    visit(node, ctx) {
      if (node.tagName === 'table') {
        ctx.wrapNode(node, element('div', { className: ['cl-prose-table'] }));
        return undefined;
      }
      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code',
      );
      if (!code) return undefined;
      return codeBlock(ctx.textContent(node), fenceLanguage(code));
    },
  },
} satisfies PluginDefinition;

/**
 * The unified hast tree react-markdown hands a rehype plugin, as far as this
 * plugin reads it. Its elements have the same shape Sätteri's do, so both
 * plugins build the one CodeBlock markup.
 */
type TreeNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Element['properties'];
  children?: TreeNode[];
};

function treeText(node: TreeNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(treeText).join('');
}

function treeElement(node: Element): TreeNode {
  return node;
}

type BlockOptions = Readonly<{
  /** False when the renderer frames tables itself (to name each one by its heading). */
  tables?: boolean;
}>;

/** One node of the tree: the CodeBlock for a fence, a framed table, or itself. */
function proseNode(node: TreeNode, options: BlockOptions): TreeNode {
  if (node.type !== 'element') return node;
  if (node.tagName === 'table' && options.tables !== false) {
    return { ...treeElement(element('div', { className: ['cl-prose-table'] })), children: [node] };
  }
  const code =
    node.tagName === 'pre' ? node.children?.find((child) => child.tagName === 'code') : undefined;
  if (code) {
    const classes = code.properties?.className;
    const language = Array.isArray(classes)
      ? (classes
          .map(String)
          .find((name) => name.startsWith('language-'))
          ?.slice('language-'.length) ?? null)
      : null;
    return treeElement(codeBlock(treeText(code), language));
  }
  if (node.children) node.children = node.children.map((child) => proseNode(child, options));
  return node;
}

/**
 * The same blocks as a rehype plugin, for Markdown the website renders with
 * react-markdown (the research guides): fences become CodeBlocks and, unless
 * `tables` is false, tables get Prose's scroll frame.
 */
export function rehypeProseBlocks(options: BlockOptions = {}) {
  return (tree: TreeNode) => {
    if (tree.children) tree.children = tree.children.map((child) => proseNode(child, options));
  };
}
