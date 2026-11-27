import { Fragment, useState } from 'react';

import { MARKET_LANGUAGES, marketLabel } from '@citeladder/contracts/markets';
import type { ProbeMarketValue } from '@citeladder/contracts/probes';

import { BrandRadar, rosterKey } from '@/components/perception/brand-radar';
import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';
import { Absence } from '@/components/ui/absence';
import { AppGrid } from '@/components/ui/app-grid';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ProbeLede } from '@/components/perception/probe-lede';
import { ExpandToggle, SourcePagesRow } from '@/components/perception/probe-sources';
import { ThemeComparison } from '@/components/perception/theme-comparison';
import type { FigureSegment } from '@/components/ui/figure-strip';
import { Inline, Stack } from '@/components/ui/layout';
import { Meter } from '@/components/ui/meter';
import { SectionContent, SectionStack, TitledSection } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { TableCell, TableRow, YouTag } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { marketSummary } from '@/lib/perception/probe';
import { useWorkspaceCapability } from '@/lib/project/project-scope';
import { useEngineCatalog } from '@/lib/providers/engines';

export function PerceptionMarket({ data }: Readonly<{ data: ProbeMarketValue }>) {
  const mayEdit = useWorkspaceCapability('write');
  return (
    <SectionStack>
      <Lede data={data} />
      <AppGrid layout="halves">
        <TitledSection title={`How AI describes ${data.brand}`}>
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
              <StateBlock
                kind="empty"
                inline
                message={data.known_for_answers ? 'Nothing raised.' : 'No answers.'}
              />
            )}
          </SectionContent>
        </TitledSection>
        <TitledSection
          title="Brand shape"
          actions={
            mayEdit ? (
              <Button variant="secondary" asChild>
                <ProjectLink href="/agent/context?tab=themes">Edit themes</ProjectLink>
              </Button>
            ) : undefined
          }
        >
          <SectionContent>
            <BrandRadar key={rosterKey(data.themes)} themes={data.themes} />
          </SectionContent>
        </TitledSection>
      </AppGrid>
      <RankTable data={data} />
      <ThemeComparison themes={data.themes} />
      <EngineTable data={data} />
    </SectionStack>
  );
}

function Lede({ data }: Readonly<{ data: ProbeMarketValue }>) {
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
      value: data.themes.length ? `${led.length} of ${data.themes.length}` : null,
      sub: led.map((row) => row.theme).join(', ') || undefined,
    },
  ];
  return (
    <ProbeLede
      createdAt={data.probe.created_at}
      headline={headline}
      label="Market position"
      segments={segments}
      textValues
    />
  );
}

const RANK_COLUMNS: readonly DataTableColumn[] = [
  { key: 'theme', label: 'Theme' },
  { key: 'score', label: 'Your score', kind: 'number', width: 'shortMetric' },
  { key: 'rank', label: 'Rank', kind: 'number', width: 'shortMetric' },
  { key: 'leader', label: 'Leader', width: 'name' },
  { key: 'gap', label: 'Behind leader', kind: 'number', width: 'metric' },
  { key: 'sources', label: 'Sources', kind: 'number', width: 'shortMetric' },
];

function RankTable({ data }: Readonly<{ data: ProbeMarketValue }>) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <DataTable
      title="Your rank by theme"
      columns={RANK_COLUMNS}
      state={
        data.themes.length
          ? undefined
          : { kind: 'empty', inline: true, message: 'No theme answers.' }
      }
    >
      {data.themes.map((row) => {
        const own = row.entities.find((entity) => entity.kind === 'brand');
        const leads = row.leader.kind === 'brand' && row.leader.named;
        const expanded = open === row.theme_id;
        return (
          <Fragment key={row.theme_id}>
            <TableRow>
              <TableCell>
                <ExpandToggle
                  open={expanded}
                  onToggle={() => setOpen(expanded ? null : row.theme_id)}
                >
                  {row.theme}
                </ExpandToggle>
              </TableCell>
              <TableCell numeric>{own?.score ?? 0}</TableCell>
              <TableCell numeric>
                {own?.named ? `#${row.rank} of ${row.of}` : <Absence label="Not named" />}
              </TableCell>
              <TableCell>
                {row.leader.named ? (
                  <Inline as="span">
                    {row.leader.name}
                    {row.leader.kind === 'brand' ? <YouTag /> : null}
                  </Inline>
                ) : (
                  <Absence label="No brand named" />
                )}
              </TableCell>
              <TableCell numeric>
                <Gap leads={leads} named={row.leader.named} gap={row.gap} />
              </TableCell>
              <TableCell numeric>{row.sources}</TableCell>
            </TableRow>
            {expanded ? (
              <SourcePagesRow
                label={`Sources behind ${row.theme}`}
                pages={row.pages}
                columns={RANK_COLUMNS}
              />
            ) : null}
          </Fragment>
        );
      })}
    </DataTable>
  );
}

function Gap({ leads, named, gap }: Readonly<{ leads: boolean; named: boolean; gap: number }>) {
  if (leads) return <Tag>You lead</Tag>;
  if (!named) return <Absence label="No brand named" />;
  return gap;
}

const ENGINE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'engine', label: 'Engine', width: 'name' },
  { key: 'themes', label: 'Top themes for you' },
  { key: 'rank', label: 'Your rank in its top theme', kind: 'number', width: 'metric' },
];

function EngineTable({ data }: Readonly<{ data: ProbeMarketValue }>) {
  const { label } = useEngineCatalog();
  return (
    <DataTable title="What each engine says you're known for" columns={ENGINE_COLUMNS}>
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
              <Absence label={row.answered ? 'Nothing raised' : 'No answers'} />
            )}
          </TableCell>
          <TableCell numeric>
            <RankInTopTheme rank={row.rank_in_top_theme} />
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

function RankInTopTheme({
  rank,
}: Readonly<{ rank: ProbeMarketValue['engines'][number]['rank_in_top_theme'] }>) {
  switch (rank.kind) {
    case 'rank':
      return `#${rank.rank}`;
    case 'not_named':
      return <Absence state="none" label="Not named" />;
    case 'not_asked':
      return <Absence state="not_run" label="Theme not asked" />;
    case 'no_theme':
      return <Absence state="not_applicable" label="No top theme" />;
    default: {
      const unreachable: never = rank;
      return unreachable;
    }
  }
}
