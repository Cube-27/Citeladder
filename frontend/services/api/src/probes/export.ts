import {
  classificationLabel,
  standingLabel,
  urlTypeLabel,
} from '@citeladder/contracts/page-labels';
import type { ProbePage } from '@citeladder/contracts/probes';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { assertExportBound } from '../http/table-export.ts';
import type { ProjectScope as Scope } from '../projects/brand-profile.ts';
import { probeMarket } from './market.ts';
import { probeObjections } from './objections.ts';

const PAGE_COLUMNS = [
  'position_score',
  'page_title',
  'url',
  'page_type',
  'source_type',
  'mentions_you',
  'citations',
] as const;

export const THEME_EXPORT_COLUMNS = ['theme', ...PAGE_COLUMNS] as const;
export const OBJECTION_EXPORT_COLUMNS = [
  'objection',
  ...PAGE_COLUMNS.filter((column) => column !== 'mentions_you'),
] as const;

type PageRow = Record<(typeof PAGE_COLUMNS)[number], string | number>;

function pageRows(score: string | number, pages: readonly ProbePage[]): PageRow[] {
  return pages.map((page) => ({
    position_score: score,
    page_title: page.title || page.domain,
    url: page.url,
    page_type: urlTypeLabel(page.page_format) ?? 'Not measured',
    source_type: classificationLabel(page.classification),
    mentions_you: standingLabel(page.standing),
    citations: page.citations,
  }));
}

function bounded<Row>(rows: Row[]): Row[] {
  assertExportBound(
    rows.length,
    policy.probes.export_max_rows,
    'this probe cites more pages than one file holds; open them from the tab',
  );
  return rows;
}

export async function themeExportRows(db: Database, scope: Scope) {
  const market = await probeMarket(db, scope, Infinity);
  if (market.state === 'none') return [];
  return bounded(
    market.themes.flatMap((row) => {
      const own = row.entities.find((entity) => entity.kind === 'brand');
      return pageRows(own?.score ?? 0, row.pages).map((page) => ({ theme: row.theme, ...page }));
    }),
  );
}

export async function objectionExportRows(db: Database, scope: Scope) {
  const objections = await probeObjections(db, scope, Infinity);
  if (objections.state === 'none') return [];
  return bounded(
    objections.groups.flatMap((group) =>
      pageRows(group.score ?? 'No answers', group.pages).map((page) => ({
        objection: group.name,
        ...page,
      })),
    ),
  );
}
