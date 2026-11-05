import type { BlogBlock, BlogSource } from '@/lib/marketing-content/blog';
import { Callout, type CalloutTone } from '@/components/ui/callout';
import { Tag } from '@/components/ui/tag';

import { headingId, withOccurrenceKeys } from './heading-id';

type RichPart = Extract<BlogBlock, { type: 'richParagraph' }>['content'][number];

/** The text a rich part contributes to its block's identity. */
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

/**
 * A `heatmap` table emphasises its strongest cells. Only a bare percentage is
 * eligible, and only at or above this figure — enough of a gap from the rest
 * of a column that the highlight reads as "this is the one", rather than
 * emphasising most of the table and so nothing.
 */
const HEATMAP_EMPHASIS_PERCENT = 33;

function emphasisedCell(cell: string, heatmap: boolean | undefined): boolean {
  if (!heatmap || !/^[+-]?\d+(\.\d+)?%$/.test(cell.trim())) return false;
  return Number.parseFloat(cell) >= HEATMAP_EMPHASIS_PERCENT;
}

function PostTable({ block }: Readonly<{ block: Extract<BlogBlock, { type: 'table' }> }>) {
  return (
    <div className="cl-prose-table">
      <table>
        {/* A real `<caption>`: assistive technology announces the table's name
            only when the text is the table's own caption element. */}
        {block.caption && <caption>{block.caption}</caption>}
        <thead>
          <tr>
            {withOccurrenceKeys(block.headers, (header) => header).map(({ key, value }) => (
              <th key={key} scope="col">
                {value}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {withOccurrenceKeys(block.rows, (row) => row.join('')).map(
            ({ key: rowKey, value: row }) => (
              <tr key={rowKey}>
                {withOccurrenceKeys(row, (cell) => cell).map(({ key: cellKey, value: cell }) => (
                  <td key={cellKey}>
                    {emphasisedCell(cell, block.heatmap) ? (
                      <strong data-emphasised="true">{cell}</strong>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** A checklist: its title as an h3, then each item's title, badge and description. */
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

/**
 * A flow diagram, as a Prose ordered list: each step's title in `strong`, then
 * its description. The h3 is unconditional, so a diagram without a visible
 * title still sits one level under its section.
 */
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

/** The post tones on the system's Callout; the accent is never a fill, so it is the neutral note. */
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
        if (typeof part === 'string') return <span key={`${part}:${index}`}>{part}</span>;
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
        // An InlineCitation: the numbered marker points at the post's SourcesList.
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

/**
 * One body block as Prose children: plain headings, paragraphs, lists and
 * framed tables that Prose styles, the system's Callout, and InlineCitations.
 */
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

/** A post's whole body, keyed so repeated blocks never collide. */
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
