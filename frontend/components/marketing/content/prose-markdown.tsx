import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { rehypeProseBlocks } from '@/components/content/prose-blocks';

import { FaqList } from '../sections/steps-faq-cta';
import { headingId, headingIds } from './heading-id';
import { endAlignedColumn, fitColumns, isNumericCell } from './post-blocks';
import { isSourceHeader, wholeRuns } from './table-dates';
import './reading.css';

/**
 * The guide's h2 headings, as Toc items whose ids match the rendered headings;
 * h3s are counted too, since a repeat of either takes the next number.
 */
export function researchHeadings(markdown: string) {
  const id = headingIds();
  // Both groups always take part in a match.
  return Array.from(markdown.matchAll(/^(#{2,3}) (.+)$/gm), ([, hashes = '', text = '']) => ({
    id: id(text),
    label: text,
    level: hashes.length,
  })).filter((item) => item.level === 2);
}

const CITATION_HREF = /^#source-\d+$/;

/** The hast tree react-markdown hands a rehype plugin, as far as these plugins read it. */
type TreeNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: TreeNode[];
};

const isCitation = (node: TreeNode) =>
  node.tagName === 'a' &&
  typeof node.properties?.href === 'string' &&
  CITATION_HREF.test(node.properties.href);

type CitationRun = TreeNode & { tagName: 'span'; children: TreeNode[] };

const isCitationRun = (node: TreeNode | undefined): node is CitationRun =>
  node?.tagName === 'span' &&
  node.properties?.className === 'cl-icite-run' &&
  Array.isArray(node.children);

const WORD_JOINER = '\u2060';

/**
 * Adjacent citation links share one unbreakable run, so a cluster never wraps
 * inside, and a run joins the word before it so it never starts a line alone.
 */
function groupCitations(node: TreeNode) {
  if (!node.children) return;
  const grouped: TreeNode[] = [];
  for (const child of node.children) {
    groupCitations(child);
    const last = grouped.at(-1);
    if (!isCitation(child)) grouped.push(child);
    else if (isCitationRun(last)) last.children.push(child);
    else {
      if (last?.type === 'text') last.value = (last.value ?? '').trimEnd();
      grouped.push({ type: 'text', value: WORD_JOINER });
      grouped.push({
        type: 'element',
        tagName: 'span',
        properties: { className: 'cl-icite-run' },
        children: [child],
      });
    }
  }
  node.children = grouped;
}

const rehypeCitationRuns = () => groupCitations;

const isBlank = (node: TreeNode) =>
  node.type === 'text' && !(node.value ?? '').replaceAll(WORD_JOINER, '').trim();

/**
 * A paragraph that is one bold run (an answer under a heading) reads at the
 * normal weight; bold stays for inline labels such as "Disclosure:".
 */
function unboldWholeParagraphs(node: TreeNode) {
  for (const child of node.children ?? []) unboldWholeParagraphs(child);
  if (node.tagName !== 'p' || !node.children) return;
  const content = node.children.filter(
    (child) => !isBlank(child) && !isCitation(child) && !isCitationRun(child),
  );
  const only = content[0];
  if (content.length !== 1 || only?.tagName !== 'strong') return;
  node.children = node.children.flatMap((child) =>
    child === only ? (child.children ?? []) : [child],
  );
}

const rehypeWholeParagraphWeight = () => unboldWholeParagraphs;

const isWholeRun = (node: TreeNode) =>
  node.tagName === 'span' && node.properties?.className === 'cl-whole';

/** Each date, hyphenated name or versioned name in text becomes one unbreakable `span.cl-whole`. */
function keepRunsWhole(node: TreeNode) {
  if (!node.children || node.tagName === 'code' || node.tagName === 'pre' || isWholeRun(node)) {
    return;
  }
  node.children = node.children.flatMap((child): TreeNode[] => {
    if (child.type !== 'text') {
      keepRunsWhole(child);
      return [child];
    }
    return wholeRuns(child.value ?? '').map((run) =>
      run.whole
        ? {
            type: 'element',
            tagName: 'span',
            properties: { className: 'cl-whole' },
            children: [{ type: 'text', value: run.text }],
          }
        : { type: 'text', value: run.text },
    );
  });
}

/** Longest inline code kept on one line; a longer one may still wrap. */
const WHOLE_CODE_LENGTH = 32;

/** Whole runs in running text and headings stay on one line, and so does a short inline code token. */
function keepTokensWhole(node: TreeNode) {
  if (node.tagName === 'pre') return;
  if (node.tagName === 'code') {
    if (nodeText(node).length <= WHOLE_CODE_LENGTH) {
      node.properties = { ...node.properties, dataWhole: '' };
    }
    return;
  }
  if (['p', 'li', 'h2', 'h3', 'h4'].includes(node.tagName ?? '')) keepRunsWhole(node);
  for (const child of node.children ?? []) keepTokensWhole(child);
}

const rehypeWholeTokens = () => keepTokensWhole;

const elements = (node: TreeNode | undefined, tagName: string) =>
  (node?.children ?? []).filter((child) => child.tagName === tagName);

const nodeText = (node: TreeNode): string =>
  node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(nodeText).join('');

const without = (row: TreeNode, cell: TreeNode | undefined) => {
  row.children = (row.children ?? []).filter((child) => child !== cell);
};

/**
 * A source column is not a column: each row's source moves under its first
 * cell as a secondary line (links and citations kept), or, when it is only
 * citations, runs on after the cell's text like a citation in a sentence; the
 * column and its header are dropped.
 */
function foldSourceColumn(head: readonly TreeNode[], body: readonly TreeNode[]) {
  const headers = head.map((row) => elements(row, 'th'));
  const column = headers[0]?.findIndex((header) => isSourceHeader(nodeText(header))) ?? -1;
  if (column <= 0) return;
  const label = nodeText(headers[0]?.[column] ?? { type: 'text' }).trim();
  for (const [index, row] of head.entries()) without(row, headers[index]?.[column]);
  for (const row of body) {
    const cells = elements(row, 'td');
    const source = cells[column];
    without(row, source);
    if (!source?.children?.length || !nodeText(source).trim()) continue;
    if (source.children.every((child) => isBlank(child) || isCitationRun(child))) {
      const last = cells[0]?.children?.at(-1);
      if (last?.type === 'text') last.value = (last.value ?? '').trimEnd();
      cells[0]?.children?.push(
        { type: 'text', value: WORD_JOINER },
        ...source.children.filter(isCitationRun),
      );
      continue;
    }
    cells[0]?.children?.push({
      type: 'element',
      tagName: 'span',
      properties: { className: 'cl-cell-source' },
      children: [
        {
          type: 'element',
          tagName: 'span',
          properties: { className: 'sr-only' },
          children: [{ type: 'text', value: `${label}: ` }],
        },
        ...source.children,
      ],
    });
  }
}

/**
 * A figure cell is `data-numeric` (one line, tabular figures); a column of
 * mostly figures is `data-align="end"`, its header included, so the figures
 * and their header share a right edge. A short column is `data-fit` (its
 * content's width). A header row with no text is dropped, a source column
 * folds under the first cell, and every whole run in a body cell stays whole.
 */
function markNumericColumns(node: TreeNode) {
  if (node.tagName !== 'table') {
    for (const child of node.children ?? []) markNumericColumns(child);
    return;
  }
  const blankHead = elements(node, 'thead').every((part) => !nodeText(part).trim());
  if (blankHead) node.children = (node.children ?? []).filter((child) => child.tagName !== 'thead');
  const head = elements(node, 'thead').flatMap((part) => elements(part, 'tr'));
  const body = elements(node, 'tbody').flatMap((part) => elements(part, 'tr'));
  foldSourceColumn(head, body);
  const headCells = head.map((row) => elements(row, 'th'));
  for (const cell of headCells.flat()) cell.properties = { ...cell.properties, scope: 'col' };
  const bodyCells = body.map((row) => elements(row, 'td'));
  const columns = Math.max(0, ...bodyCells.map((cells) => cells.length));
  for (const cell of bodyCells.flat()) keepRunsWhole(cell);
  const columnCells = Array.from({ length: columns }, (_, column) =>
    bodyCells.flatMap((row) => row[column] ?? []),
  );
  const columnHeaders = Array.from({ length: columns }, (_, column) =>
    headCells.flatMap((row) => row[column] ?? []),
  );
  const fits = fitColumns(
    columnCells.map((cells, column) => ({
      cells: cells.map(nodeText),
      header: (columnHeaders[column] ?? []).map(nodeText).join(' '),
    })),
  );
  for (const [column, cells] of columnCells.entries()) {
    const headers = columnHeaders[column] ?? [];
    const numeric = cells.filter((cell) => isNumericCell(nodeText(cell)));
    for (const cell of numeric) cell.properties = { ...cell.properties, dataNumeric: '' };
    if (fits[column]?.cells) {
      for (const cell of cells) cell.properties = { ...cell.properties, dataFit: '' };
    }
    if (fits[column]?.header) {
      for (const header of headers) header.properties = { ...header.properties, dataFit: '' };
    }
    if (column === 0 || numeric.length === 0) continue;
    for (const header of headers) header.properties = { ...header.properties, dataNumeric: '' };
    if (!endAlignedColumn(cells.map(nodeText))) continue;
    for (const cell of [...cells, ...headers]) {
      cell.properties = { ...cell.properties, dataAlign: 'end' };
    }
  }
}

const rehypeNumericColumns = () => markNumericColumns;

/**
 * Each h2 and h3 gets the anchor id the Toc links to (`researchHeadings`
 * numbers repeats the same way), and each table the id of the heading above
 * it, which names its region.
 */
function assignHeadingIds(tree: TreeNode) {
  const id = headingIds();
  let heading: string | undefined;
  const visit = (node: TreeNode) => {
    if (node.tagName === 'h2' || node.tagName === 'h3') {
      heading = id(nodeText(node));
      node.properties = { ...node.properties, id: heading };
    } else if (node.tagName === 'table' && heading) {
      node.properties = { ...node.properties, dataHeading: heading };
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
}

const rehypeHeadingIds = () => assignHeadingIds;

/**
 * Elements carry no classes, so Prose styles them; header cells are column
 * headers, and a `[\[n\]](#source-n)` link becomes an InlineCitation.
 */
const components: Components = {
  a: ({ href, children }) =>
    href && CITATION_HREF.test(href) ? (
      <sup className="cl-icite">
        <a href={href} aria-label={`Source ${href.slice('#source-'.length)}`}>
          {children}
        </a>
      </sup>
    ) : (
      <a href={href}>{children}</a>
    ),
};

/** A single line keeps its inline content without a wrapping paragraph. */
const inlineComponents: Components = {
  ...components,
  p: ({ children }) => <>{children}</>,
};

/**
 * Each table is a region named by the heading above it, so a screen reader
 * says what it compares.
 */
const markdownComponents: Components = {
  ...components,
  table: ({ children, node }) => {
    const heading = node?.properties.dataHeading;
    return (
      <section
        aria-labelledby={typeof heading === 'string' ? heading : undefined}
        aria-label={typeof heading === 'string' ? undefined : 'Research table'}
        className="cl-prose-table"
      >
        <table>{children}</table>
      </section>
    );
  },
};

/**
 * Research Markdown as Prose children, with no hydration: copy, links,
 * citations, fences (CodeBlocks) and tables arrive in the HTML. Raw HTML in
 * the Markdown is skipped.
 */
export function ProseMarkdown({ markdown }: Readonly<{ markdown: string }>) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        [rehypeProseBlocks, { tables: false }],
        rehypeHeadingIds,
        rehypeCitationRuns,
        rehypeWholeParagraphWeight,
        rehypeNumericColumns,
        rehypeWholeTokens,
      ]}
      components={markdownComponents}
      skipHtml
    >
      {markdown}
    </Markdown>
  );
}

/** A guide's FAQ section as a FaqList, each answer rendered from its Markdown. */
export function MarkdownFaq({
  items,
}: Readonly<{ items: readonly Readonly<{ question: string; answer: string }>[] }>) {
  return (
    <FaqList
      items={items.map((item) => ({
        id: headingId(item.question),
        question: item.question,
        answer: <ProseMarkdown markdown={item.answer} />,
      }))}
    />
  );
}

/** One line of Markdown (a source), without a wrapping paragraph. */
export function InlineMarkdown({ markdown }: Readonly<{ markdown: string }>) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={inlineComponents} skipHtml>
      {markdown}
    </Markdown>
  );
}
