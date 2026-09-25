'use client';

import { ChevronRight } from 'lucide-react';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import type { DemandSignal } from '@/lib/api/demand';
import {
  demandSignalHandoffHref,
  groupByPage,
  numericMetric,
  signalTarget,
  signalTypeMeta,
  type RankedSignal,
} from '@/lib/demand/signals';
import { formatCount } from '@/lib/format';

/** A signal type as a labelled chip; its meaning lives in the legend. */
export function SignalChip({ signalType }: Readonly<{ signalType: string }>) {
  const meta = signalTypeMeta(signalType);
  return meta.tone === 'neutral' ? (
    <Badge>{meta.label}</Badge>
  ) : (
    <Badge variant="status" value={meta.tone}>
      {meta.label}
    </Badge>
  );
}

/** Each signal type present, explained once (plan §12). */
export function SignalLegend({ signals }: Readonly<{ signals: readonly DemandSignal[] }>) {
  const types = [...new Set(signals.map((signal) => signal.signal_type))];
  if (types.length === 0) return null;
  return (
    <section aria-label="Signal types">
      <dl className="grid gap-2 sm:grid-cols-2">
        {types.map((type) => (
          <div key={type} className="flex items-start gap-2">
            <dt className="shrink-0">
              <SignalChip signalType={type} />
            </dt>
            <dd className={textRole('meta')}>{signalTypeMeta(type).definition}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * One table grouped by page: a row per signal with its Search Console
 * figures and a chip, never prose. Detail stays in the evidence drawer.
 */
export function DemandSignalTable({
  rows,
  onInspect,
}: Readonly<{ rows: readonly RankedSignal[]; onInspect: (signal: DemandSignal) => void }>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Query</TableHead>
          <TableHead>Signal</TableHead>
          <TableHead numeric>Impressions</TableHead>
          <TableHead numeric>Clicks</TableHead>
          <TableHead numeric>CTR</TableHead>
          <TableHead numeric>Position</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      {groupByPage(rows).map((group) => (
        <TableBody key={group.page ?? 'unresolved'}>
          <TableRow className="bg-panel-tonal hover:bg-panel-tonal">
            <TableCell colSpan={8} className={textRole('label', 'break-all')}>
              {group.page ?? 'No page resolved'}
            </TableCell>
          </TableRow>
          {group.rows.map(({ signal, rank }) => (
            <SignalRow key={signal.id} signal={signal} rank={rank} onInspect={onInspect} />
          ))}
        </TableBody>
      ))}
    </Table>
  );
}

function SignalRow({
  signal,
  rank,
  onInspect,
}: Readonly<{ signal: DemandSignal; rank: number; onInspect: (signal: DemandSignal) => void }>) {
  const target = signalTarget(signal);
  return (
    <TableRow>
      <TableCell className={textRole('meta', 'tabular-nums')}>#{rank}</TableCell>
      <TableCell className="max-w-80 break-words">{target}</TableCell>
      <TableCell>
        <SignalChip signalType={signal.signal_type} />
      </TableCell>
      <TableCell numeric>
        <Count value={numericMetric(signal, 'impressions')} />
      </TableCell>
      <TableCell numeric>
        <Count value={numericMetric(signal, 'clicks')} />
      </TableCell>
      <TableCell numeric>
        <Ctr signal={signal} />
      </TableCell>
      <TableCell numeric>
        <Position value={numericMetric(signal, 'position')} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Inspect evidence for ${target}`}
            onClick={() => onInspect(signal)}
          >
            Inspect
          </Button>
          <Button variant="tonal" size="sm" asChild>
            <ProjectLink
              href={demandSignalHandoffHref(signal)}
              aria-label={`Ask agent about ${target}`}
            >
              Ask agent
              <ChevronRight className="size-3" aria-hidden />
            </ProjectLink>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function Count({ value }: Readonly<{ value: number | null }>) {
  return value === null ? <UnavailableValue state="not_measured" /> : formatCount(value);
}

function Position({ value }: Readonly<{ value: number | null }>) {
  return value === null ? <UnavailableValue state="not_measured" /> : value.toFixed(1);
}

/** The persisted CTR, else clicks over impressions; never a guessed zero. */
function Ctr({ signal }: Readonly<{ signal: DemandSignal }>) {
  const persisted = numericMetric(signal, 'ctr');
  if (persisted !== null) return `${(persisted * 100).toFixed(1)}%`;
  const impressions = numericMetric(signal, 'impressions');
  const clicks = numericMetric(signal, 'clicks');
  if (impressions === null || clicks === null || impressions === 0)
    return <UnavailableValue state="not_measured" />;
  return `${((clicks / impressions) * 100).toFixed(1)}%`;
}
