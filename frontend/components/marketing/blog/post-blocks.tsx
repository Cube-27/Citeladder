import { AlertTriangle, ArrowDown, Check, CheckCircle2, Info } from 'lucide-react';

import type { BlogBlock, BlogDiagram, BlogSource } from '@/lib/marketing-content/blog';
import { cn } from '@/lib/utils';

/**
 * Slug for a body heading, used as its anchor id and contents target.
 *
 * A heading carrying no ASCII alphanumerics at all — one written entirely in
 * another script, or in punctuation — would otherwise slug to the bare prefix,
 * so every such heading in a post would answer to the same anchor. The
 * character-sum fallback keeps those distinct. Two headings with identical
 * text still collide by construction; `content.test.ts` fails the build on a
 * post that contains a pair, which is the point at which an editor can retitle
 * one rather than ship a contents link that jumps to the wrong section.
 */
export function headingId(text: string): string {
  const slug = text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug) return `s-${slug}`;
  let sum = 0;
  for (const character of text) sum = (sum * 31 + character.codePointAt(0)!) % 1_000_000;
  return `s-h${sum}`;
}

export function withOccurrenceKeys<T>(
  values: readonly T[],
  identity: (value: T) => string,
): Array<{ key: string; value: T }> {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const base = identity(value);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return { key: `${base}:${occurrence}`, value };
  });
}

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
 * colouring most of the table and emphasising nothing.
 */
const HEATMAP_EMPHASIS_PERCENT = 33;

function emphasisedCell(cell: string, heatmap: boolean | undefined): boolean {
  if (!heatmap || !/^[+-]?\d+(\.\d+)?%$/.test(cell.trim())) return false;
  return Number.parseFloat(cell) >= HEATMAP_EMPHASIS_PERCENT;
}

function PostTable({
  headers,
  rows,
  caption,
  heatmap,
}: Readonly<{
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  caption?: string;
  heatmap?: boolean;
}>) {
  return (
    <div className="cp-table">
      <table>
        {/* A real `<caption>`, not a styled bar above the table: assistive
            technology only announces the table's name when the text is the
            table's own caption element. */}
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {withOccurrenceKeys(headers, (header) => header).map(({ key, value }) => (
              <th key={key} scope="col">
                {value}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {withOccurrenceKeys(rows, (row) => row.join('')).map(({ key: rowKey, value: row }) => (
            <tr key={rowKey}>
              {withOccurrenceKeys(row, (cell) => cell).map(({ key: cellKey, value: cell }) => (
                <td key={cellKey} data-emphasised={emphasisedCell(cell, heatmap) || undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PostChecklist({
  items,
  title,
}: Readonly<{
  items: readonly { title: string; description: string; badge?: string }[];
  title?: string;
}>) {
  return (
    <div className="cp-checklist">
      {title && <h3 className="website-feature-heading mb-3">{title}</h3>}
      <ul>
        {withOccurrenceKeys(items, (item) => item.title).map(({ key, value: item }) => (
          <li key={key}>
            <Check className="size-4" aria-hidden="true" />
            <span className="flex flex-wrap items-center gap-2">
              <span className="cp-node-title">{item.title}</span>
              {item.badge && <span className="cp-chip">{item.badge}</span>}
            </span>
            <p className="website-body text-muted">{item.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiagramArchitecture({
  data,
}: Readonly<{ data: Extract<BlogDiagram, { variant: 'architecture' }>['data'] }>) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {data.sources.map((source) => (
          <div key={source.title} className="cp-node">
            <span className="cp-chip">{source.badge}</span>
            <h4 className="cp-node-title">{source.title}</h4>
            <p className="cp-node-text">{source.description}</p>
          </div>
        ))}
      </div>
      <ArrowDown className="text-muted mx-auto size-4" aria-hidden="true" />
      {data.destination && (
        <div className="cp-node cp-node-strong text-center">
          <h4 className="cp-node-title">{data.destination.title}</h4>
          <p className="cp-node-text">{data.destination.description}</p>
        </div>
      )}
    </div>
  );
}

function SplitColumn({
  title,
  badge,
  items,
  strong = false,
}: Readonly<{ title: string; badge: string; items: readonly string[]; strong?: boolean }>) {
  return (
    <div className={cn('cp-node gap-3', strong && 'cp-node-strong')}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="cp-node-title">{title}</h4>
        <span className="cp-chip">{badge}</span>
      </div>
      <ul className="cp-node-list">
        {withOccurrenceKeys(items, (item) => item).map(({ key, value }) => (
          <li key={key}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function DiagramSplit({
  data,
}: Readonly<{ data: Extract<BlogDiagram, { variant: 'split' }>['data'] }>) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SplitColumn title={data.leftTitle} badge={data.leftBadge} items={data.leftItems} />
      <SplitColumn title={data.rightTitle} badge={data.rightBadge} items={data.rightItems} strong />
    </div>
  );
}

function DiagramFlow({
  data,
}: Readonly<{ data: Extract<BlogDiagram, { variant: 'flow' }>['data'] }>) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {data.steps.map((step) => (
        <li key={step.step} className="cp-node">
          <span className="cp-step">{step.step}</span>
          <h4 className="cp-node-title">{step.title}</h4>
          <p className="cp-node-text">{step.desc}</p>
        </li>
      ))}
    </ol>
  );
}

function DiagramTaxonomy({
  data,
}: Readonly<{ data: Extract<BlogDiagram, { variant: 'taxonomy' }>['data'] }>) {
  return (
    <div className="grid gap-3">
      <div className="cp-node cp-node-strong text-center">
        <span className="website-label">Category anchor</span>
        <h4 className="cp-node-title">{data.root}</h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {data.nodes.map((node) => (
          <div key={node.category} className="cp-node">
            <span className="cp-chip">{node.intent}</span>
            <h5 className="cp-node-title">{node.category}</h5>
            <p className="cp-node-text">{node.details}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renders one diagram block; the payload is narrowed by `variant`, never cast. */
function PostDiagram({ block }: Readonly<{ block: Extract<BlogBlock, { type: 'diagram' }> }>) {
  return (
    <figure className="cp-figure">
      {/* The h3 is unconditional. Every diagram variant renders h4s inside it,
          so making the h3 depend on a visible title left those h4s hanging
          under the section's h2 -- a skipped level whenever a diagram is
          declared without one, which the type permits. */}
      {block.title ? (
        <h3 className="website-small-heading cp-figure-title">{block.title}</h3>
      ) : (
        <h3 className="sr-only">System model</h3>
      )}
      {block.variant === 'architecture' && <DiagramArchitecture data={block.data} />}
      {block.variant === 'split' && <DiagramSplit data={block.data} />}
      {block.variant === 'flow' && <DiagramFlow data={block.data} />}
      {block.variant === 'taxonomy' && <DiagramTaxonomy data={block.data} />}
    </figure>
  );
}

// Tone colours come from the design tokens the rest of the site uses, and only
// the icon carries them: the note itself stays a quiet tinted panel.
const CALLOUT_TONES = {
  warning: { icon: AlertTriangle, mark: 'text-warning' },
  info: { icon: Info, mark: 'text-info' },
  accent: { icon: CheckCircle2, mark: 'text-accent-text' },
} as const;

function PostCallout({
  text,
  title,
  tone = 'accent',
}: Readonly<{
  text: string;
  title?: string;
  tone?: 'accent' | 'warning' | 'info';
}>) {
  const { icon: Icon, mark } = CALLOUT_TONES[tone];
  return (
    <aside className="cp-callout">
      <Icon className={cn('size-4', mark)} aria-hidden="true" />
      <div className="grid min-w-0 gap-1">
        {/* h3, not h4: a callout follows either a `heading` (h2) or a
            `subheading` (h3), so h4 skipped a level whenever no subheading
            stood between it and the section it belongs to. h3 is correct under
            a heading and level-flat under a subheading; neither is a skip. */}
        {title && <h3 className="website-small-heading">{title}</h3>}
        <p>{text}</p>
      </div>
    </aside>
  );
}

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
        const sourceIndex = sources.findIndex((source) => source.id === part.sourceId);
        const source = sources[sourceIndex];
        if (!source) return null;
        return (
          <a
            key={`${part.sourceId}:${index}`}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Source ${sourceIndex + 1}: ${source.title}`}
            className="cp-cite"
          >
            {part.label ?? `[${sourceIndex + 1}]`}
          </a>
        );
      })}
    </p>
  );
}

/**
 * One body block. Prose blocks carry no measure or colour of their own: the
 * `cp-prose` article column sets the reading measure and rhythm for its direct
 * children, so a post and a Markdown research guide read identically.
 */
export function PostBlock({
  block,
  sources = [],
}: Readonly<{ block: BlogBlock; sources?: readonly BlogSource[] }>) {
  switch (block.type) {
    case 'heading':
      return (
        <h2 id={headingId(block.text)} className="website-section-heading cp-prose-h2">
          {block.text}
        </h2>
      );
    case 'subheading':
      return (
        <h3 id={headingId(block.text)} className="website-feature-heading cp-prose-h3">
          {block.text}
        </h3>
      );
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
      return (
        <PostTable
          headers={block.headers}
          rows={block.rows}
          caption={block.caption}
          heatmap={block.heatmap}
        />
      );
    case 'checklist':
      return <PostChecklist items={block.items} title={block.title} />;
    case 'diagram':
      return <PostDiagram block={block} />;
    case 'callout':
      return <PostCallout text={block.text} title={block.title} tone={block.tone} />;
  }
}
