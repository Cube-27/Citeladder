/**
 * The brand-by-theme map (AV-6): for each named business, the share of its
 * classified mentions that raise each theme. A business below the minimum
 * classified count reads "too few" in every cell, never a zero or a share.
 */
import type { PerceptionResponse } from '@citeladder/contracts/visibility-perception';

import { PERCEPTION_MIN_CLASSIFIED, THEME_MAP_COLUMNS } from '@/lib/config/visibility';

type Entity = PerceptionResponse['entities'][number];

export type ThemeCell =
  | { kind: 'too_few'; classified: number }
  | { kind: 'share'; share: number; mentions: number };

type ThemeMapRow = { name: string; isBrand: boolean; cells: ThemeCell[] };

export type ThemeMap = {
  themes: string[];
  rows: ThemeMapRow[];
  /** Your highest share, or null when your row is too few or raises no theme. */
  top: { theme: string; share: number } | null;
  /** The theme where a competitor leads you by the most, or null when none does. */
  gap: { theme: string; leader: string; points: number } | null;
};

const shareOf = (cell: ThemeCell | undefined) => (cell?.kind === 'share' ? cell.share : null);

/** The map's columns: the themes raised most across every business, at most `columns`. */
function columnsOf(entities: readonly Entity[], columns: number) {
  const totals = new Map<string, number>();
  for (const entity of entities)
    for (const { theme, mentions } of entity.theme_mentions)
      totals.set(theme, (totals.get(theme) ?? 0) + mentions);
  return [...totals]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, columns)
    .map(([theme]) => theme);
}

function rowOf(entity: Entity, themes: readonly string[], minimum: number): ThemeMapRow {
  const classified = entity.coverage.classified;
  const counts = new Map(entity.theme_mentions.map((row) => [row.theme, row.mentions]));
  return {
    name: entity.name,
    isBrand: entity.is_brand,
    cells: themes.map((theme): ThemeCell => {
      if (classified < minimum || classified === 0) return { kind: 'too_few', classified };
      const mentions = counts.get(theme) ?? 0;
      return { kind: 'share', share: mentions / classified, mentions };
    }),
  };
}

export function themeAssociation(
  entities: readonly Entity[],
  { minimum = PERCEPTION_MIN_CLASSIFIED, columns = THEME_MAP_COLUMNS } = {},
): ThemeMap {
  const themes = columnsOf(entities, columns);
  const rows = entities.map((entity) => rowOf(entity, themes, minimum));
  const you = rows.find((row) => row.isBrand);
  let top: ThemeMap['top'] = null;
  let gap: ThemeMap['gap'] = null;
  themes.forEach((theme, index) => {
    const yours = shareOf(you?.cells[index]);
    if (yours === null) return;
    if (yours > 0 && (top === null || yours > top.share)) top = { theme, share: yours };
    for (const row of rows) {
      const theirs = shareOf(row.cells[index]);
      if (row.isBrand || theirs === null || theirs <= yours) continue;
      const points = Math.round((theirs - yours) * 100);
      if (gap === null || points > gap.points) gap = { theme, leader: row.name, points };
    }
  });
  return { themes, rows, top, gap };
}
