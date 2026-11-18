import { Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Inline } from '@/components/ui/layout';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow, YouTag } from '@/components/ui/table';
import { BrandMark } from '@/components/ui/brand-mark';
import { CellMeter } from '@/components/ui/meter';
import { Absence } from '@/components/ui/absence';
import type { RankingRow } from '@citeladder/contracts';
import { SHARE_OF_VOICE_HINT, WIN_RATE_HINT } from '@/lib/config/visibility';
import { formatPositionExact, formatRate, measured } from '@/lib/visibility/dashboard';
import {
  competitorHref,
  orderByVisibility,
  rankingRowKey,
  winRateAbsence,
} from '@/lib/visibility/ranking';
import { Delta } from '@/components/ui/delta';
import { textRole } from '@/components/ui/typography';
import { TitledSection } from '@/components/ui/section';
import { SentimentValue } from '@/components/visibility/sentiment-value';
import { TextLink } from '@/components/ui/text-link';

const TITLE = 'You and your competitors';

const SENTIMENT_HINT =
  'Net sentiment: positive minus negative mentions, as a share of the classified mentions of each brand, from −100 to +100.';

const POSITION_HINT =
  'Where a brand tends to appear among the brands you track, averaged over the answers that name it. 1.0 means it is named first every time.';

/**
 * Where you stand against the brands you track: how often each is named, its
 * share of voice, where it lands among the brands an answer names, and how
 * that moved. Rows run highest visibility first, so the order is the rank.
 *
 * A missing change is an em dash and the reason is stated once above the
 * table, not in every row. The table is never paged: it holds at most six
 * brands (owner, 2026-10-21).
 */
export function RankingRowsTable({
  rows,
  description,
}: Readonly<{
  rows: readonly RankingRow[];
  /** What the Change column compares against, stated once. */
  description?: string;
}>) {
  const navigate = useNavigate();
  const ordered = orderByVisibility(rows);
  // Runs measured before mention offsets were persisted have no position.
  const anyPosition = ordered.some((row) => row.avg_position != null);
  // Runs admitted without perception classify no mention.
  const anySentiment = ordered.some((row) => row.sentiment != null);
  return (
    <TitledSection title={TITLE} description={description}>
      <DataTable
        label={TITLE}
        columns={rankingColumns({ anyPosition, anySentiment })}
        minWidth="md"
        state={
          ordered.length
            ? undefined
            : {
                kind: 'empty',
                headingLevel: 3,
                icon: Users,
                heading: 'No measured responses in this selection',
              }
        }
        footer="How often each brand is named, across the same answers."
      >
        {ordered.map((row) => {
          // A matched-subset delta is the same measurement over the cells both
          // runs share; the note above the table says which one it is.
          const change = row.matched_visibility_delta ?? row.visibility_delta;
          return (
            <TableRow
              key={rankingRowKey(row)}
              highlight={row.is_brand}
              {...(row.is_brand
                ? {}
                : {
                    className: 'cursor-pointer',
                    onClick: () => navigate(competitorHref(row.name)),
                  })}
            >
              <TableCell>
                <Inline as="span">
                  <BrandMark name={row.name} logoUrl={row.logo_url} websiteUrl={row.website_url} />
                  <ClampText lines={1} className={textRole('emphasis')}>
                    {/* The whole row opens the competitor; the name is the keyboard's way in. */}
                    {row.is_brand ? (
                      row.name
                    ) : (
                      <TextLink
                        href={competitorHref(row.name)}
                        text="inherit"
                        underline="hover"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {row.name}
                      </TextLink>
                    )}
                  </ClampText>
                  {row.is_brand ? <YouTag /> : null}
                </Inline>
              </TableCell>
              <TableCell numeric>
                <VisibilityValue row={row} />
              </TableCell>
              <TableCell numeric>
                {measured(formatRate(row.share_of_voice)) ?? <Absence />}
              </TableCell>
              {anyPosition ? (
                <TableCell numeric>
                  {row.avg_position == null ? <Absence /> : formatPositionExact(row.avg_position)}
                </TableCell>
              ) : null}
              <TableCell numeric>
                <WinRateValue row={row} />
              </TableCell>
              {anySentiment ? (
                <TableCell numeric>
                  <SentimentValue sentiment={row.sentiment} />
                </TableCell>
              ) : null}
              <TableCell numeric>
                <Delta value={change} unit=" pp" />
              </TableCell>
            </TableRow>
          );
        })}
      </DataTable>
    </TitledSection>
  );
}

/** The rate beside its bar; an unmeasured rate is an absence, never an empty bar. */
function VisibilityValue({ row }: Readonly<{ row: RankingRow }>) {
  const value = measured(formatRate(row.mention_rate));
  if (row.mention_rate == null || value == null) return <Absence />;
  return (
    <Inline as="span" className="justify-end">
      <CellMeter
        label={`${row.name} visibility`}
        value={row.mention_rate}
        max={1}
        valueText={value}
        tone={row.is_brand ? 'accent' : 'ink'}
      />
      <span>{value}</span>
    </Inline>
  );
}

/** No answer naming a tracked brand is not applicable, not zero. */
function WinRateValue({ row }: Readonly<{ row: RankingRow }>) {
  if (row.win_rate != null) return <span>{formatRate(row.win_rate)}</span>;
  return <Absence narrow state={winRateAbsence(row)} />;
}

function rankingColumns({
  anyPosition,
  anySentiment,
}: Readonly<{
  anyPosition: boolean;
  anySentiment: boolean;
}>): DataTableColumn[] {
  return [
    { key: 'brand', label: 'Brand', kind: 'identity' },
    // Wide enough for the 120px bar beside its rate.
    { key: 'visibility', label: 'Visibility', width: 'name', kind: 'number' },
    {
      key: 'sov',
      label: 'Share of voice',
      hint: SHARE_OF_VOICE_HINT,
      width: 'shortMetric',
      kind: 'number',
    },
    ...(anyPosition
      ? [
          {
            key: 'position',
            label: 'Position',
            hint: POSITION_HINT,
            width: 'short',
            kind: 'number',
          } as const,
        ]
      : []),
    { key: 'win_rate', label: 'Win rate', hint: WIN_RATE_HINT, width: 'short', kind: 'number' },
    ...(anySentiment
      ? [
          {
            key: 'sentiment',
            label: 'Sentiment',
            hint: SENTIMENT_HINT,
            width: 'metric',
            kind: 'number',
          } as const,
        ]
      : []),
    { key: 'change', label: 'Change', width: 'short', kind: 'number' },
  ];
}
