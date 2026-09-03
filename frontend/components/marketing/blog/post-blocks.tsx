import { AlertTriangle, ArrowDown, Check, CheckCircle2, Info } from 'lucide-react';

import type { BlogBlock, BlogDiagram } from '@/lib/marketing-content/blog';
import { cn } from '@/lib/utils';

/** Slug for a body heading, used as its anchor id and contents target. */
export function headingId(text: string): string {
  return `s-${text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
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

export function blockIdentity(block: BlogBlock): string {
  if ('text' in block) {
    return `${block.type}:${block.text.slice(0, 40)}`;
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
    <div className="border-border-subtle bg-panel my-6 overflow-hidden rounded-[var(--radius-card)] border">
      {caption && (
        <div className="border-border-subtle bg-panel-tonal border-b px-4 py-2.5">
          <p className="website-label text-muted">{caption}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-border-subtle bg-panel-tonal/60 border-b">
              {withOccurrenceKeys(headers, (header) => header).map(({ key, value }) => (
                <th
                  key={key}
                  scope="col"
                  className="website-label text-foreground px-4 py-3 font-semibold"
                >
                  {value}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border-subtle divide-y">
            {withOccurrenceKeys(rows, (row) => row.join('')).map(({ key: rowKey, value: row }) => (
              <tr key={rowKey} className="hover:bg-accent-soft/30 transition-colors">
                {withOccurrenceKeys(row, (cell) => cell).map(
                  ({ key: cellKey, value: cell }, cIdx) => {
                    const percent =
                      heatmap && /^[+-]?\d+(\.\d+)?%$/.test(cell.trim())
                        ? Number.parseFloat(cell)
                        : undefined;
                    const emphasised = percent !== undefined && percent >= HEATMAP_EMPHASIS_PERCENT;
                    return (
                      <td
                        key={cellKey}
                        className={cn(
                          'px-4 py-3 align-top text-sm text-muted',
                          cIdx === 0 && 'font-medium text-foreground',
                          emphasised && 'bg-accent-soft/60 font-semibold text-accent-text',
                        )}
                      >
                        {cell}
                      </td>
                    );
                  },
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    <div className="border-border-subtle bg-panel my-6 rounded-[var(--radius-card)] border p-5 md:p-6">
      {title && (
        <h3 className="website-small-heading text-foreground mb-4 font-semibold">{title}</h3>
      )}
      <div className="grid gap-4">
        {withOccurrenceKeys(items, (item) => item.title).map(({ key, value: item }) => (
          <div key={key} className="flex items-start gap-3.5">
            <div className="bg-accent-soft text-accent-text mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
              <Check className="size-3.5 stroke-[2.5]" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-foreground text-sm font-medium">{item.title}</span>
                {item.badge && (
                  <span className="bg-accent-soft text-accent-text rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {item.badge}
                  </span>
                )}
              </div>
              <p className="website-body text-muted mt-1 leading-relaxed">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagramArchitecture({
  data,
}: Readonly<{ data: Extract<BlogDiagram, { variant: 'architecture' }>['data'] }>) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {data.sources.map((source) => (
          <div
            key={source.title}
            className="border-border-subtle bg-panel-tonal flex flex-col justify-between rounded-[var(--radius-control)] border p-4"
          >
            <div>
              <span className="bg-accent-soft text-accent-text mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium">
                {source.badge}
              </span>
              <h4 className="website-body text-foreground font-semibold">{source.title}</h4>
              <p className="website-body text-muted mt-2 leading-relaxed">{source.description}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="my-2 flex items-center justify-center">
        <div className="bg-accent-soft text-accent-text flex size-8 items-center justify-center rounded-full">
          <ArrowDown className="size-4" aria-hidden="true" />
        </div>
      </div>
      {data.destination && (
        <div className="border-accent-border/60 bg-accent-soft/30 rounded-[var(--radius-control)] border p-4 text-center">
          <h4 className="website-small-heading text-foreground font-bold tracking-wide">
            {data.destination.title}
          </h4>
          <p className="website-body text-muted mt-1 leading-relaxed">
            {data.destination.description}
          </p>
        </div>
      )}
    </div>
  );
}

function DiagramSplit({
  data,
}: Readonly<{ data: Extract<BlogDiagram, { variant: 'split' }>['data'] }>) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border-border-subtle bg-panel-tonal/60 rounded-[var(--radius-control)] border p-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="website-body text-foreground font-semibold">{data.leftTitle}</h4>
          <span className="border-border-subtle bg-panel-tonal text-muted rounded-full border px-2 py-0.5 text-xs">
            {data.leftBadge}
          </span>
        </div>
        <div className="grid gap-2">
          {withOccurrenceKeys(data.leftItems, (item) => item).map(({ key, value }) => (
            <div key={key} className="text-muted flex items-start gap-2 text-sm">
              <span className="bg-border mt-1 size-1.5 shrink-0 rounded-full" aria-hidden="true" />
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-accent-border/60 bg-accent-soft/20 rounded-[var(--radius-control)] border p-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="website-body text-foreground font-semibold">{data.rightTitle}</h4>
          <span className="bg-accent-soft text-accent-text rounded-full px-2 py-0.5 text-xs font-medium">
            {data.rightBadge}
          </span>
        </div>
        <div className="grid gap-2">
          {withOccurrenceKeys(data.rightItems, (item) => item).map(({ key, value }) => (
            <div key={key} className="text-foreground flex items-start gap-2 text-sm">
              <span
                className="bg-accent-text mt-1 size-1.5 shrink-0 rounded-full"
                aria-hidden="true"
              />
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiagramFlow({
  data,
}: Readonly<{ data: Extract<BlogDiagram, { variant: 'flow' }>['data'] }>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {data.steps.map((step) => (
        <div
          key={step.step}
          className="border-border-subtle bg-panel-tonal relative flex flex-col justify-between rounded-[var(--radius-control)] border p-4"
        >
          <div>
            <span className="bg-accent-soft text-accent-text mb-2.5 flex size-6 items-center justify-center rounded-full text-xs font-bold">
              {step.step}
            </span>
            <h4 className="website-body text-foreground font-semibold">{step.title}</h4>
            <p className="website-body text-muted mt-1.5 leading-relaxed">{step.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiagramTaxonomy({
  data,
}: Readonly<{ data: Extract<BlogDiagram, { variant: 'taxonomy' }>['data'] }>) {
  return (
    <div>
      <div className="border-accent-border/60 bg-accent-soft/30 mb-4 rounded-[var(--radius-control)] border p-3 text-center">
        <span className="website-label text-accent-text text-xs font-bold tracking-wider uppercase">
          Category Anchor
        </span>
        <h4 className="website-body text-foreground mt-0.5 font-semibold">{data.root}</h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {data.nodes.map((node) => (
          <div
            key={node.category}
            className="border-border-subtle bg-panel-tonal rounded-[var(--radius-control)] border p-4"
          >
            <span className="bg-accent-soft text-accent-text mb-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium">
              {node.intent}
            </span>
            <h5 className="website-body text-foreground font-medium">{node.category}</h5>
            <p className="website-body text-muted mt-2 leading-relaxed">{node.details}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renders one diagram block; the payload is narrowed by `variant`, never cast. */
function PostDiagram({ block }: Readonly<{ block: Extract<BlogBlock, { type: 'diagram' }> }>) {
  return (
    <div className="border-border-subtle bg-panel my-8 rounded-[var(--radius-card)] border p-5 md:p-6">
      {block.title && (
        <div className="border-border-subtle mb-6 flex items-center justify-between border-b pb-3">
          <h3 className="website-small-heading text-foreground font-semibold">{block.title}</h3>
          <span className="website-label text-muted">System Model</span>
        </div>
      )}
      {block.variant === 'architecture' && <DiagramArchitecture data={block.data} />}
      {block.variant === 'split' && <DiagramSplit data={block.data} />}
      {block.variant === 'flow' && <DiagramFlow data={block.data} />}
      {block.variant === 'taxonomy' && <DiagramTaxonomy data={block.data} />}
    </div>
  );
}

function PostCallout({
  text,
  title,
  tone = 'accent',
}: Readonly<{
  text: string;
  title?: string;
  tone?: 'accent' | 'warning' | 'info';
}>) {
  // Tone colours come from the design tokens the rest of the site uses. Raw
  // Tailwind palette hues (`amber-500`, `sky-500`) would be the only ones in
  // the codebase and would not follow a rebrand of the token set.
  const TONES = {
    warning: { icon: AlertTriangle, rail: 'border-l-warning', mark: 'text-warning' },
    info: { icon: Info, rail: 'border-l-info', mark: 'text-info' },
    accent: { icon: CheckCircle2, rail: 'border-l-accent-border', mark: 'text-accent-text' },
  } as const;
  const { icon: Icon, rail, mark } = TONES[tone];
  return (
    <div
      className={cn(
        'border-border-subtle my-6 rounded-[var(--radius-card)] border border-l-4 p-5',
        tone === 'accent' ? 'bg-panel-tonal/60' : 'bg-panel-tonal',
        rail,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 size-5 shrink-0', mark)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {title && (
            <h4 className="website-small-heading text-foreground mb-1.5 font-semibold">{title}</h4>
          )}
          <p className="website-body text-muted leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}

export function PostBlock({ block }: Readonly<{ block: BlogBlock }>) {
  switch (block.type) {
    case 'heading':
      return (
        <h2
          id={headingId(block.text)}
          className="website-feature-heading text-foreground mt-10 mb-4 scroll-mt-28"
        >
          {block.text}
        </h2>
      );
    case 'subheading':
      return (
        <h3
          id={headingId(block.text)}
          className="website-small-heading text-foreground mt-8 mb-3 scroll-mt-28"
        >
          {block.text}
        </h3>
      );
    case 'list':
      return block.ordered ? (
        <ol className="website-body text-muted my-4 grid list-decimal gap-2 pl-5 leading-relaxed">
          {withOccurrenceKeys(block.items, (item) => item).map(({ key, value }) => (
            <li key={key}>{value}</li>
          ))}
        </ol>
      ) : (
        <ul className="website-body text-muted my-4 grid list-disc gap-2 pl-5 leading-relaxed">
          {withOccurrenceKeys(block.items, (item) => item).map(({ key, value }) => (
            <li key={key}>{value}</li>
          ))}
        </ul>
      );
    case 'paragraph':
      return <p className="website-body text-muted my-4 leading-relaxed">{block.text}</p>;
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
