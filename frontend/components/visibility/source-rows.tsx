'use client';

import { Badge } from '@/components/ui/badge';
import { Pressable } from '@/components/ui/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { MissingValue } from '@/components/ui/unavailable-value';
import { textRole } from '@/components/ui/typography';
import {
  count,
  hostOf,
  itemType,
  pathOf,
  percent,
  ratio,
  sinceLabel,
  typeLabel,
  type SortState,
  type SourceItem,
} from '@/lib/visibility/sources';
import { HintedHead, SortableHead } from '@/components/visibility/source-heads';
import { pageFormatBasis } from '@/lib/visibility/vocabulary';
import type { useVisibilityFilters } from '@/lib/visibility/use-visibility-dashboard';

export type SourceFilters = ReturnType<typeof useVisibilityFilters>;

/** The source's own mark and name, with the favicon a reader recognises first. */
function SourceName({
  name,
  host,
  secondary,
}: Readonly<{ name: string; host: string | null; secondary?: string | null }>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <BrandLogo name={name} websiteUrl={host ? `https://${host}` : null} size="sm" />
      <span className="grid min-w-0">
        <span className="truncate">{name}</span>
        {secondary ? (
          <span className={textRole('meta', 'text-secondary truncate')}>{secondary}</span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * A numeric cell that marks an absent value rather than spelling it out.
 *
 * The formatters answer `null` for "nothing to show"; deciding what that MEANS
 * is the table's job, and every numeric column here means the same thing by it.
 * The reason is said once, on the column header, instead of once per row --
 * see `MissingValue` for why the mark is not simply blank.
 */
function NumericCell({ value, className }: Readonly<{ value: string | null; className?: string }>) {
  return (
    <TableCell numeric className={className}>
      {value ?? <MissingValue />}
    </TableCell>
  );
}

/**
 * Each table's columns, as the classes that govern them.
 *
 * One list per table, shared by the header, the rows and the loading state, so
 * a column that is hidden below `lg` is hidden in ALL THREE. A skeleton that
 * rendered seven cells under a five-column header put a placeholder in every
 * wrong place and shifted the columns the moment the real rows arrived --
 * which is the movement this state exists to prevent.
 */
const DOMAIN_COLUMNS = [
  'w-[30%]',
  'w-[15%]',
  '',
  'hidden lg:table-cell',
  '',
  'hidden md:table-cell',
  '',
] as const;

const URL_COLUMNS = [
  'w-[32%]',
  'w-[13%]',
  '',
  '',
  'hidden xl:table-cell',
  'hidden lg:table-cell',
  'hidden lg:table-cell',
] as const;

/**
 * What a table shows INSTEAD of rows, without giving up its own structure.
 *
 * The states used to replace the whole table: a 160px skeleton, or a single
 * sentence, where ten 44px rows had been. That is a ~320px collapse on every
 * filter change, and the reader watched the page jump under the control they
 * had just clicked. Filling the existing `<tbody>` keeps the header, the
 * column widths and the footer exactly where they were.
 */
export type SourceTableState =
  | { kind: 'rows' }
  | { kind: 'loading'; rows: number }
  | { kind: 'empty'; message: string };

function StateRows({
  state,
  columns,
}: Readonly<{
  state: Exclude<SourceTableState, { kind: 'rows' }>;
  columns: readonly string[];
}>) {
  if (state.kind === 'loading') {
    return (
      <>
        {Array.from({ length: state.rows }, (_, row) => (
          <TableRow key={`loading-${row}`}>
            {columns.map((columnClass, cell) => (
              <TableCell key={cell} className={columnClass || undefined}>
                <Skeleton className="h-4 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </>
    );
  }
  return (
    <TableRow>
      <TableCell colSpan={columns.length}>
        <span className={textRole('body', 'text-secondary')}>{state.message}</span>
      </TableCell>
    </TableRow>
  );
}

/** A source's type, with the basis for the claim behind a tooltip. */
function TypeChip({
  token,
  dimension,
  method,
}: Readonly<{ token: string | null; dimension: 'domain' | 'url'; method?: string | null }>) {
  const label = typeLabel(token, dimension);
  // A type nobody has established is "not measured", not a blank: the page has
  // simply not been read and its address did not settle the question. The
  // column header carries that explanation for the whole column.
  if (!label) return <MissingValue />;
  const chip = <Badge variant="neutral">{label}</Badge>;
  const basis = pageFormatBasis(method);
  return basis ? <Tooltip content={basis}>{chip}</Tooltip> : chip;
}

/**
 * The cited domains.
 *
 * Retrieved and Retrieval rate answer different questions and sit next to each
 * other on purpose: the first is whether a publisher showed up at all, the
 * second is how many of its pages did. A site quoted once in most answers and
 * one quoted deeply in a few are opposite situations with the same first
 * number.
 */
export function DomainTable({
  rows,
  sort,
  onSort,
  onOpenDomain,
  state = { kind: 'rows' },
}: Readonly<{
  rows: readonly SourceItem[];
  sort: SortState;
  onSort: (column: string) => void;
  onOpenDomain?: (domain: string) => void;
  /** Loading or empty fills the body; the header and footer stay put. */
  state?: SourceTableState;
}>) {
  return (
    // `table-fixed` with explicit column widths: without it every column sizes
    // to its own longest cell, so filtering to a shorter set of domains
    // re-lays out the whole table under the reader's pointer.
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <SortableHead
            column="key"
            label="Source"
            sort={sort}
            onSort={onSort}
            className={DOMAIN_COLUMNS[0]}
          />
          <HintedHead
            label="Domain type"
            hint="How this publisher is classified. A domain nobody has classified yet has no type."
            className={DOMAIN_COLUMNS[1]}
          />
          <SortableHead
            column="response_rate"
            label="Retrieved"
            sort={sort}
            onSort={onSort}
            numeric
            hint="Answers that retrieved at least one page from this domain, as a share of all answers in the selection."
          />
          <SortableHead
            column="retrieval_rate"
            label="Retrieval rate"
            sort={sort}
            onSort={onSort}
            numeric
            className={DOMAIN_COLUMNS[3]}
            hint="Unique pages retrieved from this domain per answer in the selection."
          />
          <SortableHead
            column="annotations"
            label="Citations"
            sort={sort}
            onSort={onSort}
            numeric
            hint="Every inline citation belonging to this domain."
          />
          <SortableHead
            column="citation_share"
            label="Citation share"
            sort={sort}
            onSort={onSort}
            numeric
            className={DOMAIN_COLUMNS[5]}
            hint="This domain's citations as a share of every citation in the current filtered view."
          />
          <SortableHead
            column="citation_rate"
            label="Citation rate"
            sort={sort}
            onSort={onSort}
            numeric
            hint="Citations per answer that actually retrieved this domain — not per answer in the selection."
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {state.kind !== 'rows' ? <StateRows state={state} columns={DOMAIN_COLUMNS} /> : null}
        {state.kind !== 'rows'
          ? null
          : rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>
                  <Pressable
                    onClick={() => onOpenDomain?.(row.key)}
                    className="hover:text-accent-text flex max-w-full min-w-0 items-center transition-colors"
                  >
                    <SourceName name={row.key || 'Domain unavailable'} host={row.key} />
                  </Pressable>
                </TableCell>
                <TableCell>
                  <TypeChip token={itemType(row)} dimension="domain" />
                </TableCell>
                <NumericCell value={percent(row.response_rate)} />
                <NumericCell value={ratio(row.retrieval_rate)} className={DOMAIN_COLUMNS[3]} />
                <NumericCell value={count(row.annotations)} />
                <NumericCell value={percent(row.citation_share, 1)} className={DOMAIN_COLUMNS[5]} />
                <NumericCell value={ratio(row.citation_rate)} />
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}

/**
 * The brands named alongside this source, as the marks a reader recognises.
 *
 * Real logos only — `BrandLogo` falls back to initials rather than inventing a
 * mark. The overflow count is the rest of the distinct brands, so the cell
 * never grows past three chips no matter how crowded the answer was.
 */
function MentionedChips({
  brands,
  total,
}: Readonly<{ brands: SourceItem['brands']; total: number }>) {
  if (!brands.length) return <MissingValue />;
  const overflow = total - brands.length;
  return (
    <span className="flex items-center gap-1">
      {brands.map((brand) => (
        <Tooltip
          key={`${brand.kind}:${brand.name}`}
          content={`${brand.name} — named in ${brand.responses} of the answers citing this URL`}
        >
          <span className="inline-flex">
            <BrandLogo
              name={brand.name}
              logoUrl={brand.logo_url}
              websiteUrl={brand.website}
              size="xs"
            />
          </span>
        </Tooltip>
      ))}
      {overflow > 0 ? (
        <span className={textRole('meta', 'text-secondary tabular-nums')}>+{overflow}</span>
      ) : null}
    </span>
  );
}

/**
 * The cited pages.
 *
 * "Mentioned" is co-occurrence, never presence on the page: the chips are the
 * brands named in the ANSWERS that cited this URL, because no persisted row
 * links a mention to the citation beside it. The header tooltip says so, and
 * the column is not called "On page" for the same reason.
 */
export function UrlTable({
  rows,
  sort,
  onSort,
  onOpenUrl,
  state = { kind: 'rows' },
}: Readonly<{
  rows: readonly SourceItem[];
  sort: SortState;
  onSort: (column: string) => void;
  onOpenUrl: (url: string) => void;
  /** Loading or empty fills the body; the header and footer stay put. */
  state?: SourceTableState;
}>) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <SortableHead
            column="key"
            label="URL"
            sort={sort}
            onSort={onSort}
            className={URL_COLUMNS[0]}
          />
          <HintedHead
            label="URL type"
            hint="What kind of page this is. Pages nobody has read yet, and pages on your own domain, carry no type."
            className={URL_COLUMNS[1]}
          />
          <SortableHead
            column="responses"
            label="Retrievals"
            sort={sort}
            onSort={onSort}
            numeric
            hint="Answers that used this URL as a source."
          />
          <SortableHead
            column="citation_rate"
            label="Citation rate"
            sort={sort}
            onSort={onSort}
            numeric
            hint="Citations of this URL per answer that used it as a source."
          />
          <SortableHead
            column="mentions"
            label="Mentions"
            sort={sort}
            onSort={onSort}
            numeric
            className={URL_COLUMNS[4]}
            hint="Distinct brands named in the answers that cited this URL. Co-occurrence in the answer, not presence on the page."
          />
          <HintedHead
            label="Mentioned"
            hint="The brands named in the answers that cited this URL. Co-occurrence in the answer, not presence on the page."
            className={URL_COLUMNS[5]}
          />
          <SortableHead
            column="last_cited_at"
            label="Last seen"
            sort={sort}
            onSort={onSort}
            numeric
            className={URL_COLUMNS[6]}
            hint="The most recent run in this selection whose answer used this URL as a source."
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {state.kind !== 'rows' ? <StateRows state={state} columns={URL_COLUMNS} /> : null}
        {state.kind !== 'rows'
          ? null
          : rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>
                  <Pressable
                    onClick={() => onOpenUrl(row.key)}
                    className="hover:text-accent-text flex max-w-full min-w-0 items-center transition-colors"
                  >
                    <SourceName
                      name={row.title?.trim() || pathOf(row.key)}
                      host={hostOf(row.key)}
                      secondary={row.title?.trim() ? pathOf(row.key) : null}
                    />
                  </Pressable>
                </TableCell>
                <TableCell>
                  <TypeChip
                    token={row.page_format}
                    dimension="url"
                    method={row.page_format_method}
                  />
                </TableCell>
                <NumericCell value={count(row.responses)} />
                <NumericCell value={ratio(row.citation_rate)} />
                <NumericCell value={count(row.mentions)} className={URL_COLUMNS[4]} />
                <TableCell className={URL_COLUMNS[5]}>
                  <MentionedChips brands={row.brands} total={row.mentions} />
                </TableCell>
                <NumericCell value={sinceLabel(row.last_cited_at)} className={URL_COLUMNS[6]} />
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
