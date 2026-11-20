import { MARKET_LANGUAGES, marketLabel } from '@citeladder/contracts/markets';
import type { ProbeMarketValue } from '@citeladder/contracts/probes';

import { BrandRadar } from '@/components/perception/brand-radar';
import { ProjectThemesPanel } from '@/components/knowledge-base/project-themes-panel';
import { Absence } from '@/components/ui/absence';
import { AppGrid } from '@/components/ui/app-grid';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { Inline, Stack } from '@/components/ui/layout';
import { Meter } from '@/components/ui/meter';
import { Section, SectionContent, TitledSection } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { TableCell, TableRow, YouTag } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { textRole } from '@/components/ui/typography';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate } from '@/lib/format';
import { marketSummary } from '@/lib/perception/probe';
import { useWorkspaceCapability } from '@/lib/project/project-scope';
import { useEngineCatalog } from '@/lib/providers/engines';

/**
 * The Market tab (AV-36): what AI associates the brand with, and where it
 * stands against competitors on each theme, from the newest labelled probe.
 */
export function PerceptionMarket({
  scope,
  data,
}: Readonly<{ scope: ProjectScope; data: ProbeMarketValue }>) {
  const mayEdit = useWorkspaceCapability('write');
  return (
    <>
      <Lede data={data} />
      <AppGrid layout="halves">
        <TitledSection
          title={`How AI describes ${data.brand}`}
          description="Raised most, and earliest"
        >
          <SectionContent>
            {data.known_for.length ? (
              <Stack gap="compact">
                {data.known_for.map((item) => (
                  <Meter
                    key={item.theme_id ?? 'other'}
                    label={item.theme}
                    value={item.score}
                    valueLabel={String(item.score)}
                    tone={item.theme_id === null ? 'ink' : 'accent'}
                  />
                ))}
              </Stack>
            ) : (
              <StateBlock kind="empty" inline message="Nothing raised." />
            )}
          </SectionContent>
        </TitledSection>
        <TitledSection title="Brand shape" description="Position score per theme">
          <SectionContent>
            <BrandRadar themes={data.themes} />
          </SectionContent>
        </TitledSection>
      </AppGrid>
      <RankTable data={data} />
      <EngineTable data={data} />
      <TitledSection title="Themes" description="Each probe asks which brands lead each theme.">
        <SectionContent>
          <ProjectThemesPanel scope={scope} mayEdit={mayEdit} />
        </SectionContent>
      </TitledSection>
    </>
  );
}

function Lede({ data }: Readonly<{ data: ProbeMarketValue }>) {
  const timeZone = useDisplayTimeZone();
  const { top, topRow, led, biggestGap, headline } = marketSummary(data);
  const language = MARKET_LANGUAGES.find((item) => item.value === data.language_code)?.label;
  const segments: FigureSegment[] = [
    { key: 'industry', label: 'Industry', value: data.category || null, sub: 'From project setup' },
    { key: 'language', label: 'Language', value: language ?? (data.language_code || null) },
    {
      key: 'markets',
      label: 'Markets',
      value: data.probe.markets.map(marketLabel).join(', ') || null,
    },
    {
      key: 'top',
      label: 'Most associated',
      value: top?.theme ?? null,
      sub: topRow ? `#${topRow.rank} of ${topRow.of} brands` : undefined,
    },
    {
      key: 'gap',
      label: 'Biggest gap',
      value: biggestGap?.theme ?? null,
      sub: biggestGap
        ? `#${biggestGap.rank} · ${biggestGap.leader.name} ahead by ${biggestGap.gap}`
        : undefined,
    },
    {
      key: 'led',
      label: 'Themes you lead',
      value: `${led.length} of ${data.themes.length}`,
      sub: led.map((row) => row.theme).join(', ') || undefined,
    },
  ];
  return (
    <Section>
      <SectionContent>
        <Stack gap="item">
          <p className={textRole('caption', 'text-ink-2')}>
            From the market probe · {formatDisplayDate(data.probe.created_at, timeZone)}
          </p>
          <h2 className={textRole('heading')}>{headline}</h2>
          <FigureStrip label="Market position" segments={segments} subLine />
        </Stack>
      </SectionContent>
    </Section>
  );
}

const RANK_COLUMNS: readonly DataTableColumn[] = [
  { key: 'theme', label: 'Theme' },
  { key: 'score', label: 'Your score', kind: 'number', width: 'shortMetric' },
  { key: 'rank', label: 'Rank', kind: 'number', width: 'shortMetric' },
  { key: 'leader', label: 'Leader', width: 'name' },
  { key: 'gap', label: 'Gap', kind: 'number', width: 'shortMetric' },
];

function RankTable({ data }: Readonly<{ data: ProbeMarketValue }>) {
  return (
    <TitledSection
      title="Your rank by theme"
      description="Position score: 100 when named first, 10 less per place, 0 when not named"
    >
      <DataTable
        label="Your rank by theme"
        columns={RANK_COLUMNS}
        state={
          data.themes.length
            ? undefined
            : { kind: 'empty', inline: true, message: 'No themes yet.' }
        }
      >
        {data.themes.map((row) => {
          const own = row.entities.find((entity) => entity.kind === 'brand')?.score ?? 0;
          const leads = row.leader.kind === 'brand' && row.leader.score > 0;
          return (
            <TableRow key={row.theme_id}>
              <TableCell>{row.theme}</TableCell>
              <TableCell numeric>{own}</TableCell>
              <TableCell numeric>
                #{row.rank} of {row.of}
              </TableCell>
              <TableCell>
                {row.leader.score > 0 ? (
                  <Inline as="span">
                    {row.leader.name}
                    {row.leader.kind === 'brand' ? <YouTag /> : null}
                  </Inline>
                ) : (
                  <Absence label="No brand named" />
                )}
              </TableCell>
              <TableCell numeric>{leads ? <Tag>You lead</Tag> : `−${row.gap}`}</TableCell>
            </TableRow>
          );
        })}
      </DataTable>
    </TitledSection>
  );
}

const ENGINE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'engine', label: 'Engine', width: 'name' },
  { key: 'themes', label: 'Top themes for you' },
  { key: 'rank', label: 'Your rank in its top theme', kind: 'number', width: 'metric' },
];

function EngineTable({ data }: Readonly<{ data: ProbeMarketValue }>) {
  const { label } = useEngineCatalog();
  return (
    <TitledSection title="What each engine says you're known for">
      <DataTable label="What each engine says you're known for" columns={ENGINE_COLUMNS}>
        {data.engines.map((row) => (
          <TableRow key={row.engine}>
            <TableCell>{label(row.engine)}</TableCell>
            <TableCell>
              {row.top_themes.length ? (
                <Inline as="span">
                  {row.top_themes.map((theme) => (
                    <Tag key={theme.theme_id ?? 'other'}>{theme.theme}</Tag>
                  ))}
                </Inline>
              ) : (
                <Absence label="Nothing raised" />
              )}
            </TableCell>
            <TableCell numeric>
              {row.rank_in_top_theme === null ? (
                <Absence label="Not named" />
              ) : (
                `#${row.rank_in_top_theme}`
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}
