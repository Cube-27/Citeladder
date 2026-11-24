import {
  type BacklinkFigureKey,
  type searchBacklinkFiguresSchema,
  type searchDatasetSchema,
} from '@citeladder/contracts/search-intelligence';
import { sql } from 'kysely';
import type { z } from 'zod';

import type { Database } from '../db/database.ts';
import type { Scope } from './reads.ts';

type DatasetView = z.input<typeof searchDatasetSchema>;
type BacklinkFigures = z.input<typeof searchBacklinkFiguresSchema>;
type HistoryMonth = {
  backlinks: number | null;
  referring_main_domains: number | null;
  date: string | null;
};
type Carried = Partial<Record<BacklinkFigureKey, unknown>>;

const PRECEDENCE: readonly string[] = [
  'backlink_summary',
  'backlinks',
  'referring_domains',
  'backlink_history',
];

const figure = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function carried(dataset: DatasetView, months: ReadonlyMap<string, HistoryMonth>): Carried {
  switch (dataset.dataset_kind) {
    case 'backlink_summary':
      return dataset.summary;
    case 'backlinks':
      return dataset.acquisition.mode === 'as_is' ? { backlinks: dataset.provider_total } : {};
    case 'referring_domains':
      return { referring_domains: dataset.provider_total };
    case 'backlink_history':
      return months.get(dataset.id) ?? {};
    default:
      return {};
  }
}

function latestHistoryMonths(db: Database, scope: Scope, datasetIds: string[]) {
  if (!datasetIds.length) return Promise.resolve([]);
  return scope.workspace
    .selectFrom(db, 'search_intelligence_rows')
    .select(['dataset_id', 'backlinks', 'referring_main_domains'])
    .select(sql<string | null>`left(auxiliary->>'date', 10)`.as('date'))
    .distinctOn('dataset_id')
    .where('project_id', '=', scope.projectId)
    .where('dataset_id', 'in', datasetIds)
    .orderBy('dataset_id')
    .orderBy(sql`auxiliary->>'date'`, 'desc')
    .execute();
}

export async function backlinkFigures(
  db: Database,
  scope: Scope,
  newestFirst: readonly DatasetView[],
): Promise<BacklinkFigures[]> {
  const datasets = newestFirst.filter((dataset) => PRECEDENCE.includes(dataset.dataset_kind));
  const history = datasets.filter((dataset) => dataset.dataset_kind === 'backlink_history');
  const months = new Map(
    (
      await latestHistoryMonths(
        db,
        scope,
        history.map((dataset) => dataset.id),
      )
    ).map(({ dataset_id, ...month }) => [dataset_id, month]),
  );
  const targets = new Map<string, DatasetView>();
  for (const dataset of datasets) {
    const key = `${dataset.research_scope} ${dataset.target_origin}`;
    if (!targets.has(key)) targets.set(key, dataset);
  }
  return [...targets.values()].map((newest) => {
    const peers = datasets
      .filter(
        (dataset) =>
          dataset.target_origin === newest.target_origin &&
          dataset.research_scope === newest.research_scope,
      )
      .sort(
        (left, right) =>
          PRECEDENCE.indexOf(left.dataset_kind) - PRECEDENCE.indexOf(right.dataset_kind),
      );
    const pick = (key: BacklinkFigureKey) => {
      for (const dataset of peers) {
        const value = figure(carried(dataset, months)[key]);
        if (value === null) continue;
        const month = dataset.dataset_kind === 'backlink_history' ? months.get(dataset.id) : null;
        return {
          value,
          dataset_id: dataset.id,
          as_of: month ? month.date : (dataset.collection_ended_at ?? null),
        };
      }
      return null;
    };
    return {
      target_origin: newest.target_origin,
      target_hostname: newest.target_hostname,
      research_scope: newest.research_scope,
      backlinks: pick('backlinks'),
      referring_domains: pick('referring_domains'),
      referring_main_domains: pick('referring_main_domains'),
      rank: pick('rank'),
    };
  });
}
