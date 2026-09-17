'use client';

import type { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import type { visibilitySourceUrlSchema } from '@/lib/api/schemas/visibility-evidence';
import { engineLabel } from '@/lib/providers/catalog';
import { count } from '@/lib/visibility/sources';

type UrlDetail = z.infer<typeof visibilitySourceUrlSchema>;

/**
 * The three tables and lists below a URL's overview.
 *
 * Split out of the detail page so that one file holds the page's shape and
 * this one holds its contents. Together they exceeded the complexity ceiling,
 * and the states were the half that made the content hard to find.
 */

/** A card whose body is a table once there is one, and a sentence before then. */
function SectionCard({
  title,
  caption,
  loading,
  errored,
  empty,
  children,
}: Readonly<{
  title: string;
  caption?: string;
  loading: boolean;
  /** A read that FAILED has no data, so its empty sentence would be a lie. */
  errored?: boolean;
  empty: string;
  children: React.ReactNode | null;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {caption ? <p className={textRole('meta', 'text-secondary')}>{caption}</p> : null}
      </CardHeader>
      <CardContent className="p-0">
        <SectionBody loading={loading} errored={errored} empty={empty}>
          {children}
        </SectionBody>
      </CardContent>
    </Card>
  );
}

/**
 * The card's body, once its states are separated from its frame.
 *
 * The error branch comes first and renders NOTHING: "no engine used this page"
 * and "we could not find out" are different answers, and a failed request can
 * only honestly give the second. The page's own alert already reports it.
 */
function SectionBody({
  loading,
  errored,
  empty,
  children,
}: Readonly<{
  loading: boolean;
  errored?: boolean;
  empty: string;
  children: React.ReactNode | null;
}>) {
  if (errored) return null;
  if (loading) return <Skeleton className="m-[var(--card-padding)] h-24" />;
  if (children) return <>{children}</>;
  return <p className={textRole('body', 'text-secondary p-[var(--card-padding)]')}>{empty}</p>;
}

export function EnginesCard({
  engines,
  loading,
  errored,
}: Readonly<{
  engines: UrlDetail['engines'] | undefined;
  loading: boolean;
  errored?: boolean;
}>) {
  return (
    <SectionCard
      title="Retrievals by AI model"
      caption="Which engines used this page as a source."
      loading={loading}
      errored={errored}
      empty="No engine used this page in this selection."
    >
      {engines?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead numeric>Retrievals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {engines.map((row) => (
              <TableRow key={`${row.logical_engine}:${row.transport_model ?? ''}`}>
                <TableCell>
                  <span className="grid">
                    <span>{engineLabel(row.logical_engine) || row.logical_engine}</span>
                    {row.transport_model ? (
                      <span className={textRole('meta', 'text-secondary')}>
                        {row.transport_model}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell numeric>
                  {count(row.retrievals) ?? <UnavailableValue state="not_measured" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </SectionCard>
  );
}

/**
 * The brands named in the answers that cited this page.
 *
 * The caption is load-bearing: this is co-occurrence in an answer, and the
 * page's own inspected presence is a different fact. Dropping the qualifier
 * would make the two indistinguishable on screen.
 */
export function BrandsCard({
  brands,
  loading,
  errored,
}: Readonly<{
  brands: UrlDetail['brands'] | undefined;
  loading: boolean;
  errored?: boolean;
}>) {
  return (
    <SectionCard
      title="Brands mentioned"
      caption="Named in the answers that cited this URL — not necessarily present on the page itself."
      loading={loading}
      errored={errored}
      empty="No tracked brand was named in the answers citing this URL."
    >
      {brands?.length ? (
        <ul className="grid gap-2 p-[var(--card-padding)]">
          {brands.map((brand) => (
            <li key={`${brand.kind}:${brand.name}`} className="flex items-center gap-2">
              <BrandLogo
                name={brand.name}
                logoUrl={brand.logo_url}
                websiteUrl={brand.website}
                size="sm"
              />
              <span className="min-w-0 truncate">{brand.name}</span>
              <Badge
                className="ml-auto shrink-0"
                variant="classification"
                value={brand.kind === 'brand' ? 'owned' : 'competitor'}
              >
                {count(brand.responses) ?? '0'}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}

export function PromptsCard({
  rows,
  loading,
  errored,
}: Readonly<{
  rows: UrlDetail['prompt_rows'] | undefined;
  loading: boolean;
  errored?: boolean;
}>) {
  return (
    <SectionCard
      title="Prompts using this URL"
      loading={loading}
      errored={errored}
      empty="No prompt in this selection reached this URL."
    >
      {rows?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prompt</TableHead>
              <TableHead className="hidden md:table-cell">Topic</TableHead>
              <TableHead className="hidden lg:table-cell">Models</TableHead>
              <TableHead numeric>Answers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.prompt_text}:${row.topic ?? ''}`}>
                <TableCell className="max-w-[32rem]">
                  <span className="block truncate">{row.prompt_text || 'Untitled prompt'}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {row.topic ? (
                    <Badge variant="neutral">{row.topic}</Badge>
                  ) : (
                    <UnavailableValue state="not_set" />
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {row.engines.map((engine) => engineLabel(engine) || engine).join(', ')}
                </TableCell>
                <TableCell numeric>{count(row.responses) ?? '0'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </SectionCard>
  );
}
