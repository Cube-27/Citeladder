import type { ProbeObjectionsValue } from '@citeladder/contracts/probes';

import { ObjectionActions } from '@/components/perception/objection-actions';
import { Absence } from '@/components/ui/absence';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Delta } from '@/components/ui/delta';
import { Disclosure } from '@/components/ui/disclosure';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { Stack } from '@/components/ui/layout';
import { Section, SectionContent, TitledSection } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import {
  TableActionsCell,
  TableCell,
  TableCellLines,
  TableRow,
  UrlText,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate, pluralCount } from '@/lib/format';
import { objectionsSummary } from '@/lib/perception/probe';
import { useWorkspaceCapability } from '@/lib/project/project-scope';

type Group = ProbeObjectionsValue['groups'][number];

/**
 * The Objections tab (AV-36): why AI says a buyer might not choose the brand,
 * grouped across probes, with each group's position score and its sources.
 */
export function PerceptionObjections({
  scope,
  data,
}: Readonly<{ scope: ProjectScope; data: ProbeObjectionsValue }>) {
  return (
    <>
      <Lede data={data} />
      <ObjectionTable scope={scope} data={data} />
      <ObjectionSources groups={data.groups} />
    </>
  );
}

function Lede({ data }: Readonly<{ data: ProbeObjectionsValue }>) {
  const timeZone = useDisplayTimeZone();
  const { raised, widest, average, headline } = objectionsSummary(data);
  const segments: FigureSegment[] = [
    {
      key: 'found',
      label: 'Objections found',
      value: String(raised.length),
      sub: `Grouped from ${pluralCount(data.answers, 'answer')}`,
    },
    {
      key: 'widest',
      label: 'Raised by most engines',
      value: widest ? `${widest.engines.length} of ${data.probe.engines.length}` : null,
      sub: widest?.name,
    },
    {
      key: 'average',
      label: 'Average position score',
      value: average === null ? null : String(average),
      sub: '100 means always raised first',
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
          <FigureStrip label="Objections" segments={segments} subLine />
        </Stack>
      </SectionContent>
    </Section>
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'objection', label: 'Objection' },
  { key: 'score', label: 'Position score', kind: 'number', width: 'metric' },
  { key: 'engines', label: 'Engines', kind: 'number', width: 'shortMetric' },
  { key: 'trend', label: 'Trend', sublabel: 'Since last probe', kind: 'number', width: 'metric' },
  { key: 'sources', label: 'Sources', kind: 'number', width: 'shortMetric' },
  { key: 'actions', label: 'Actions', kind: 'actions' },
];

function ObjectionTable({
  scope,
  data,
}: Readonly<{ scope: ProjectScope; data: ProbeObjectionsValue }>) {
  const mayEdit = useWorkspaceCapability('write');
  const columns = mayEdit ? COLUMNS : COLUMNS.filter((column) => column.key !== 'actions');
  return (
    <TitledSection
      title={`Why buyers might not choose ${data.brand}`}
      description="Higher score is raised earlier"
    >
      <DataTable
        label="Objections"
        columns={columns}
        state={
          data.groups.length
            ? undefined
            : { kind: 'empty', inline: true, message: 'No objections raised.' }
        }
      >
        {data.groups.map((group) => (
          <TableRow key={group.id}>
            <TableCell>{group.name}</TableCell>
            <TableCell numeric>{group.score}</TableCell>
            <TableCell numeric>
              {group.engines.length} of {data.probe.engines.length}
            </TableCell>
            <TableCell numeric>
              {/* A higher score is raised earlier: a rise is worse for the brand. */}
              <Delta
                value={group.change}
                policy="lower-is-better"
                precision={0}
                missingReason="No previous probe"
              />
            </TableCell>
            <TableCell numeric>
              {group.sources ? group.sources : <Absence state="none" label="No sources" />}
            </TableCell>
            {mayEdit ? (
              <TableActionsCell>
                <ObjectionActions
                  scope={scope}
                  group={group}
                  others={data.groups.filter((other) => other.id !== group.id)}
                />
              </TableActionsCell>
            ) : null}
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

const PAGE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'page', label: 'Page' },
  { key: 'type', label: 'Source type', width: 'category' },
  { key: 'citations', label: 'Citations', kind: 'number', width: 'shortMetric' },
];

function ObjectionSources({ groups }: Readonly<{ groups: readonly Group[] }>) {
  const cited = groups.filter((group) => group.pages.length > 0);
  return (
    <TitledSection
      title="Sources behind the objections"
      description="Pages engines cited while raising each objection"
    >
      <SectionContent>
        {cited.length ? (
          <Stack gap="item">
            {cited.map((group) => (
              <Disclosure
                key={group.id}
                title={`${group.name} · ${pluralCount(group.pages.length, 'page')} · Score ${group.score}`}
              >
                <DataTable
                  label={`Sources behind ${group.name}`}
                  columns={PAGE_COLUMNS}
                  rowLines={2}
                >
                  {group.pages.map((page) => (
                    <TableRow key={page.url}>
                      <TableCell>
                        <TableCellLines
                          primary={page.title || page.domain}
                          secondary={<UrlText url={page.url} />}
                          secondaryTooltip={page.url}
                        />
                      </TableCell>
                      <TableCell>{page.classification}</TableCell>
                      <TableCell numeric>{page.citations}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              </Disclosure>
            ))}
          </Stack>
        ) : (
          <StateBlock kind="empty" inline message="No sources." />
        )}
      </SectionContent>
    </TitledSection>
  );
}
