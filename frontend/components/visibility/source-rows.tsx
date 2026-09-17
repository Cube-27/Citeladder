'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Pressable } from '@/components/ui/pressable';
import { BrandLogo } from '@/components/ui/brand-logo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
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
import { pageFormatBasis } from '@/lib/visibility/vocabulary';
import type { useVisibilityFilters } from '@/lib/visibility/use-visibility-dashboard';

export type SourceFilters = ReturnType<typeof useVisibilityFilters>;

/**
 * A column header that can reorder the table.
 *
 * The sort indicator is always present, not only on the active column: a
 * header that grows an arrow on hover gives no sign it is sortable until the
 * pointer is already on it, which is invisible to anyone navigating by
 * keyboard.
 */
function SortableHead({
  column,
  label,
  sort,
  onSort,
  numeric,
  hint,
  className,
}: Readonly<{
  column: string;
  label: string;
  sort: SortState;
  onSort: (column: string) => void;
  numeric?: boolean;
  hint?: string;
  className?: string;
}>) {
  const active = sort?.column === column;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  const heading = (
    <Pressable
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}`}
      className={cn(
        'hover:text-primary inline-flex w-auto items-center gap-1 transition-colors',
        numeric && 'flex-row-reverse',
        active && 'text-primary',
      )}
    >
      <Icon className={cn('size-3 shrink-0', active ? 'opacity-100' : 'opacity-40')} aria-hidden />
      <span>{label}</span>
    </Pressable>
  );
  return (
    <TableHead numeric={numeric} className={className}>
      {hint ? <Tooltip content={hint}>{heading}</Tooltip> : heading}
    </TableHead>
  );
}

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
 * A numeric cell that names an absent value rather than drawing a dash.
 *
 * The formatters answer `null` for "nothing to show"; deciding what that MEANS
 * is the table's job, and every numeric column here means the same thing by it.
 */
function NumericCell({ value, className }: Readonly<{ value: string | null; className?: string }>) {
  return (
    <TableCell numeric className={className}>
      {value ?? <UnavailableValue state="not_measured" />}
    </TableCell>
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
  // simply not been read and its address did not settle the question.
  if (!label) return <UnavailableValue state="not_measured" />;
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
}: Readonly<{
  rows: readonly SourceItem[];
  sort: SortState;
  onSort: (column: string) => void;
  onOpenDomain?: (domain: string) => void;
}>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead column="key" label="Source" sort={sort} onSort={onSort} />
          <TableHead>Domain type</TableHead>
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
            className="hidden lg:table-cell"
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
            className="hidden md:table-cell"
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
        {rows.map((row) => (
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
            <NumericCell value={ratio(row.retrieval_rate)} className="hidden lg:table-cell" />
            <NumericCell value={count(row.annotations)} />
            <NumericCell value={percent(row.citation_share, 1)} className="hidden md:table-cell" />
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
  if (!brands.length) return <UnavailableValue state="not_measured" />;
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
}: Readonly<{
  rows: readonly SourceItem[];
  sort: SortState;
  onSort: (column: string) => void;
  onOpenUrl: (url: string) => void;
}>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead column="key" label="URL" sort={sort} onSort={onSort} />
          <TableHead>URL type</TableHead>
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
            className="hidden xl:table-cell"
            hint="Distinct brands named in the answers that cited this URL. Co-occurrence in the answer, not presence on the page."
          />
          <TableHead className="hidden lg:table-cell">Mentioned</TableHead>
          <SortableHead
            column="last_cited_at"
            label="Last seen"
            sort={sort}
            onSort={onSort}
            numeric
            className="hidden lg:table-cell"
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="max-w-[28rem]">
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
              <TypeChip token={row.page_format} dimension="url" method={row.page_format_method} />
            </TableCell>
            <NumericCell value={count(row.responses)} />
            <NumericCell value={ratio(row.citation_rate)} />
            <NumericCell value={count(row.mentions)} className="hidden xl:table-cell" />
            <TableCell className="hidden lg:table-cell">
              <MentionedChips brands={row.brands} total={row.mentions} />
            </TableCell>
            <NumericCell value={sinceLabel(row.last_cited_at)} className="hidden lg:table-cell" />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
