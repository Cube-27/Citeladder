import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { rehypeProseBlocks } from '@/components/content/prose-blocks';

import { FaqList } from '../sections/steps-faq-cta';
import { headingId, headingIds } from './heading-id';
import { endAlignedColumn, fitColumns, isNumericCell } from './post-blocks';
import { isSourceHeader, wholeRuns } from './table-dates';
import './reading.css';

export function researchHeadings(markdown: string) {
  const id = headingIds();
  return Array.from(markdown.matchAll(/^(#{2,3}) (.+)$/gm), ([, hashes = '', text = '']) => ({
    id: id(text),
    label: text,
    level: hashes.length,
  })).filter((item) => item.level === 2);
}

const CITATION_HREF = /^#source-\d+$/;

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
      grouped.push(
        { type: 'text', value: WORD_JOINER },
        {
          type: 'element',
          tagName: 'span',
          properties: { className: 'cl-icite-run' },
          children: [child],
        },
      );
    }
  }
  node.children = grouped;
}

const rehypeCitationRuns = () => groupCitations;

const isBlank = (node: TreeNode) =>
  node.type === 'text' && !(node.value ?? '').replaceAll(WORD_JOINER, '').trim();

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

const WHOLE_CODE_LENGTH = 32;

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
    markColumn({ column, cells, headers: columnHeaders[column] ?? [], fit: fits[column] });
  }
}

const mark = (nodes: readonly TreeNode[], properties: Record<string, string>) => {
  for (const node of nodes) node.properties = { ...node.properties, ...properties };
};

function markColumn({
  column,
  cells,
  headers,
  fit,
}: Readonly<{
  column: number;
  cells: readonly TreeNode[];
  headers: readonly TreeNode[];
  fit: ReturnType<typeof fitColumns>[number] | undefined;
}>) {
  const numeric = cells.filter((cell) => isNumericCell(nodeText(cell)));
  mark(numeric, { dataNumeric: '' });
  if (fit?.cells) mark(cells, { dataFit: '' });
  if (fit?.header) mark(headers, { dataFit: '' });
  if (column === 0 || numeric.length === 0) return;
  mark(headers, { dataNumeric: '' });
  if (endAlignedColumn(cells.map(nodeText))) mark([...cells, ...headers], { dataAlign: 'end' });
}

const rehypeNumericColumns = () => markNumericColumns;

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

const inlineComponents: Components = {
  ...components,
  p: ({ children }) => <>{children}</>,
};

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

export function InlineMarkdown({ markdown }: Readonly<{ markdown: string }>) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={inlineComponents} skipHtml>
      {markdown}
    </Markdown>
  );
}
