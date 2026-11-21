import type { BlogBlock, BlogSource } from '@/lib/marketing-content/blog';
import { Callout, type CalloutTone } from '@/components/ui/callout';
import { Tag } from '@/components/ui/tag';

import { headingId, withOccurrenceKeys } from './heading-id';
import { isSourceHeader, wholeRuns } from './table-dates';
import './reading.css';

type RichPart = Extract<BlogBlock, { type: 'richParagraph' }>['content'][number];

function richPartIdentity(part: RichPart): string {
  if (typeof part === 'string') return part;
  return part.type === 'link' ? part.text : part.sourceId;
}

export function blockIdentity(block: BlogBlock): string {
  if ('text' in block) {
    return `${block.type}:${block.text.slice(0, 40)}`;
  }
  if (block.type === 'richParagraph') {
    return `rich:${block.content.map(richPartIdentity).join('').slice(0, 40)}`;
  }
  if (block.type === 'list') {
    return `list:${block.items.length}:${block.items[0] ?? ''}`;
  }
  if (block.type === 'table') {
    return `table:${block.caption ?? ''}:${block.headers.join(',')}`;
  }
  return `${block.type}:${block.title ?? ''}`;
}

const HEATMAP_EMPHASIS_PERCENT = 33;

function emphasisedCell(cell: string, heatmap: boolean | undefined): boolean {
  if (!heatmap || !/^[+-]?\d+(\.\d+)?%$/.test(cell.trim())) return false;
  return Number.parseFloat(cell) >= HEATMAP_EMPHASIS_PERCENT;
}

const FIT_CELL_LENGTH = 24;
const FIT_HEADER_LENGTH = 16;

const FIGURE_WORDS = /\b(?:thousand|million|billion|trillion|over|under|about|nearly)\b/gi;

const FIGURE_LED = /^(?:(?:over|under|about|nearly|up|down)\s+)?[~<>+-]?\$?\d/i;

export function isNumericCell(text: string) {
  const value = text.trim();
  return (
    /\d/.test(value) &&
    value.length <= FIT_CELL_LENGTH &&
    (FIGURE_LED.test(value) || !/[A-Za-z]{4,}/.test(value.replace(FIGURE_WORDS, '')))
  );
}

export function endAlignedColumn(cells: readonly string[]) {
  const filled = cells.map((cell) => cell.trim()).filter(Boolean);
  const figures = filled.filter(isNumericCell).length;
  return (
    figures * 2 > filled.length &&
    filled.every(
      (cell) => isNumericCell(cell) || FIGURE_LED.test(cell) || cell.length <= FIT_CELL_LENGTH,
    )
  );
}

function fitColumn({ cells, header }: Readonly<{ cells: readonly string[]; header: string }>) {
  const fit = cells.every((cell) => cell.trim().length <= FIT_CELL_LENGTH);
  return { cells: fit, header: fit && header.trim().length <= FIT_HEADER_LENGTH };
}

export function fitColumns(columns: readonly Parameters<typeof fitColumn>[0][]) {
  const fits = columns.map(fitColumn);
  if (fits.length > 1 && fits.every((fit) => fit.cells)) fits[0] = { cells: false, header: false };
  return fits;
}

function CellText({ text }: Readonly<{ text: string }>) {
  const runs = wholeRuns(text);
  if (!runs.some((run) => run.whole)) return text;
  return runs.map((run, index) =>
    run.whole ? (
      <span key={`${run.text}:${index}`} className="cl-whole">
        {run.text}
      </span>
    ) : (
      run.text
    ),
  );
}

function foldSource(row: readonly string[], column: number) {
  if (column <= 0) return { cells: row, source: '' };
  return { cells: row.filter((_, index) => index !== column), source: row[column]?.trim() ?? '' };
}

function numericColumns(rows: readonly (readonly string[])[], count: number) {
  return Array.from(
    { length: count },
    (_, column) => column > 0 && rows.some((row) => isNumericCell(row[column] ?? '')),
  );
}

function PostTable({ block }: Readonly<{ block: Extract<BlogBlock, { type: 'table' }> }>) {
  const sourceColumn = block.headers.findIndex(isSourceHeader);
  const sourceLabel = block.headers[sourceColumn] ?? '';
  const headers = foldSource(block.headers, sourceColumn).cells;
  const rows = block.rows.map((row) => foldSource(row, sourceColumn));
  const cellRows = rows.map((row) => row.cells);
  const columnCells = headers.map((_, column) => cellRows.map((row) => row[column] ?? ''));
  const numericHeader = numericColumns(cellRows, headers.length);
  const align = (column: number) =>
    column > 0 && endAlignedColumn(columnCells[column] ?? []) ? 'end' : undefined;
  const fit = fitColumns(
    headers.map((header, column) => ({ cells: columnCells[column] ?? [], header })),
  );
  const flag = (on: boolean | undefined) => (on ? '' : undefined);
  return (
    <div className="cl-prose-table">
      <table>
        {block.caption && <caption>{block.caption}</caption>}
        {headers.some((header) => header.trim()) && (
          <thead>
            <tr>
              {withOccurrenceKeys(headers, (header) => header).map(({ key, value }, column) => (
                <th
                  key={key}
                  scope="col"
                  data-align={align(column)}
                  data-numeric={flag(numericHeader[column])}
                  data-fit={flag(fit[column]?.header)}
                >
                  {value}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {withOccurrenceKeys(rows, (row) => [...row.cells, row.source].join('')).map(
            ({ key: rowKey, value: row }) => (
              <tr key={rowKey}>
                {withOccurrenceKeys(row.cells, (cell) => cell).map(
                  ({ key: cellKey, value: cell }, column) => (
                    <td
                      key={cellKey}
                      data-align={align(column)}
                      data-numeric={flag(isNumericCell(cell))}
                      data-fit={flag(fit[column]?.cells)}
                    >
                      {emphasisedCell(cell, block.heatmap) ? (
                        <strong data-emphasised="true">{cell}</strong>
                      ) : (
                        <CellText text={cell} />
                      )}
                      {column === 0 && row.source && (
                        <span className="cl-cell-source">
                          <span className="sr-only">{`${sourceLabel}: `}</span>
                          <CellText text={row.source} />
                        </span>
                      )}
                    </td>
                  ),
                )}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function PostChecklist({ block }: Readonly<{ block: Extract<BlogBlock, { type: 'checklist' }> }>) {
  return (
    <>
      {block.title && <h3>{block.title}</h3>}
      <ul>
        {withOccurrenceKeys(block.items, (item) => item.title).map(({ key, value: item }) => (
          <li key={key}>
            <strong>{item.title}</strong>
            {item.badge && (
              <>
                {' '}
                <Tag>{item.badge}</Tag>
              </>
            )}
            {`: ${item.description}`}
          </li>
        ))}
      </ul>
    </>
  );
}

function PostDiagram({ block }: Readonly<{ block: Extract<BlogBlock, { type: 'diagram' }> }>) {
  return (
    <>
      {block.title ? <h3>{block.title}</h3> : <h3 className="sr-only">System model</h3>}
      <ol>
        {block.data.steps.map((step) => (
          <li key={step.step}>
            <strong>{step.title}:</strong> {step.desc}
          </li>
        ))}
      </ol>
    </>
  );
}

const CALLOUT_TONE: Readonly<Record<'accent' | 'warning' | 'info', CalloutTone>> = {
  accent: 'neutral',
  warning: 'warning',
  info: 'info',
};

function RichParagraph({
  content,
  sources,
}: Readonly<{
  content: Extract<BlogBlock, { type: 'richParagraph' }>['content'];
  sources: readonly BlogSource[];
}>) {
  return (
    <p>
      {content.map((part, index) => {
        if (typeof part === 'string') {
          const next = content[index + 1];
          const joined =
            typeof next === 'object' &&
            next.type === 'citation' &&
            sources.some((source) => source.id === next.sourceId);
          return <span key={`${part}:${index}`}>{joined ? `${part.trimEnd()}\u2060` : part}</span>;
        }
        if (part.type === 'link') {
          return (
            <a
              key={`${part.href}:${index}`}
              href={part.href}
              {...(part.href.startsWith('https://') ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              {part.text}
            </a>
          );
        }
        const sourceIndex = sources.findIndex((source) => source.id === part.sourceId);
        const source = sources[sourceIndex];
        if (!source) return null;
        return (
          <sup key={`${part.sourceId}:${index}`} className="cl-icite">
            <a
              href={`#source-${sourceIndex + 1}`}
              aria-label={`Source ${sourceIndex + 1}: ${source.title}`}
            >
              {part.label ?? `[${sourceIndex + 1}]`}
            </a>
          </sup>
        );
      })}
    </p>
  );
}

export function PostBlock({
  block,
  sources = [],
}: Readonly<{ block: BlogBlock; sources?: readonly BlogSource[] }>) {
  switch (block.type) {
    case 'heading':
      return <h2 id={headingId(block.text)}>{block.text}</h2>;
    case 'subheading':
      return <h3 id={headingId(block.text)}>{block.text}</h3>;
    case 'list': {
      const items = withOccurrenceKeys(block.items, (item) => item).map(({ key, value }) => (
        <li key={key}>{value}</li>
      ));
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case 'paragraph':
      return <p>{block.text}</p>;
    case 'richParagraph':
      return <RichParagraph content={block.content} sources={sources} />;
    case 'table':
      return <PostTable block={block} />;
    case 'checklist':
      return <PostChecklist block={block} />;
    case 'diagram':
      return <PostDiagram block={block} />;
    case 'callout':
      return (
        <Callout tone={CALLOUT_TONE[block.tone ?? 'accent']} title={block.title}>
          {block.text}
        </Callout>
      );
  }
}

export function PostBody({
  blocks,
  sources,
}: Readonly<{ blocks: readonly BlogBlock[]; sources: readonly BlogSource[] }>) {
  return (
    <>
      {withOccurrenceKeys(blocks, blockIdentity).map(({ key, value }) => (
        <PostBlock key={key} block={value} sources={sources} />
      ))}
    </>
  );
}
