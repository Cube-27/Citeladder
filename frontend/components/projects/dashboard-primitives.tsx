import { ArrowDown, ArrowUp, GripVertical, TrendingUp } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { hairlineBandItemClasses } from '@/components/ui/workspace';
import { ProjectLink } from '@/components/layout/scoped-link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricValue } from '@/components/ui/metric-value';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import type { CommandCenter, Opportunity } from '@/lib/api/types';
import { availabilityLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';

export function metricValue(value: number | null, suffix = '') {
  if (value === null) return availabilityLabel('not_measured');
  const figure = Number.isInteger(value) ? value : value.toFixed(1);
  return `${figure}${suffix}`;
}

/** No comparable run is not a bad one, so it stays muted rather than red. */
function deltaToneClass(delta: number | null): string {
  if (delta === null) return 'text-muted';
  return 'text-secondary';
}

export function deltaLabel(delta: number | null, inverse = false) {
  if (delta === null) return 'No comparable run';
  const display = inverse ? -delta : delta;
  return `${display > 0 ? '+' : ''}${display.toFixed(1)} vs previous`;
}

export function StateMetric({
  label,
  value,
  delta,
  suffix,
  inverse,
}: Readonly<{
  label: string;
  value: number | null;
  delta: number | null;
  suffix?: string;
  inverse?: boolean;
}>) {
  return (
    <div
      className={cn(
        hairlineBandItemClasses,
        'flex min-h-[104px] flex-col justify-between min-[981px]:grid min-[981px]:min-h-0 min-[981px]:content-start min-[981px]:gap-1',
      )}
    >
      <p className={eyebrowClasses}>{label}</p>
      <MetricValue
        value={value === null ? null : metricValue(value, suffix)}
        label={availabilityLabel('not_measured')}
      />
      {/* A missing value has no change to report; the section states why once. */}
      <p className={cn(textRole('delta'), deltaToneClass(delta))}>
        {value === null ? '\u00a0' : deltaLabel(delta, inverse)}
      </p>
    </div>
  );
}

export function MovementChart({ movements }: Readonly<{ movements: CommandCenter['movements'] }>) {
  if (movements.length === 0)
    return (
      <EmptyState
        variant="compact"
        icon={TrendingUp}
        heading="No comparable measurement yet"
        description="Needs a second run with the same prompts and engines."
      />
    );
  const ceiling = Math.max(...movements.flatMap((row) => [row.current ?? 0, row.previous ?? 0]), 1);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {movements.map((row) => (
        <div key={row.label} className="grid min-w-0 gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className={textRole('label', 'capitalize')}>{row.label}</span>
            <span className={cn(textRole('delta'), 'text-secondary')}>
              {row.delta !== null ? (
                <>
                  {row.delta > 0 ? '+' : ''}
                  {row.delta}
                </>
              ) : (
                <UnavailableValue state="not_measured" />
              )}
            </span>
          </div>
          <div className="flex h-14 items-end gap-2" aria-hidden>
            <span
              className="bg-border-strong w-6 rounded-t-xs transition-[height]"
              style={{ height: `${Math.max(6, ((row.previous ?? 0) / ceiling) * 56)}px` }}
            />
            <span
              className="bg-chart-1 w-6 rounded-t-xs transition-[height]"
              style={{ height: `${Math.max(6, ((row.current ?? 0) / ceiling) * 56)}px` }}
            />
          </div>
          <p className={textRole('caption', 'text-center')}>Previous · Current</p>
        </div>
      ))}
    </div>
  );
}

export function ActionRow({
  action,
  index,
  total,
  onMove,
  onDrop,
  reorderPending,
}: Readonly<{
  action: Opportunity;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onDrop: (from: number, to: number) => void;
  reorderPending: boolean;
}>) {
  const [dragging, setDragging] = useState(false);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Pointer drag is progressive enhancement; adjacent buttons provide the complete keyboard reorder path.
    <li
      draggable={!reorderPending}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', String(index));
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!reorderPending) onDrop(Number(event.dataTransfer.getData('text/plain')), index);
      }}
      className={cn(
        'border-border-subtle hover:bg-active grid gap-3 border-b py-3 transition-colors last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center',
        dragging && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="text-muted hover:text-foreground size-4 cursor-grab" aria-hidden />
        <span className={textRole('label', 'w-5 text-center tabular-nums')}>{index + 1}</span>
      </div>
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectLink
            href={action.action_id ? `/agent/actions/${action.action_id}` : '/agent/actions'}
            className={textRole('itemTitle', 'hover:text-accent-text transition-colors')}
          >
            {action.title}
          </ProjectLink>
          {action.severity === 'critical' ? (
            <Badge variant="status" value="danger">
              {action.severity}
            </Badge>
          ) : (
            <Badge>{action.severity}</Badge>
          )}
        </div>
        <p className="type-caption truncate">
          {action.target_label ?? 'Project-wide'} · {action.evidence_summary.count} persisted
          evidence item(s)
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className={textRole('figureSm', 'me-2')}>{action.priority_score.toFixed(1)}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMove(index, index - 1)}
          disabled={reorderPending || index === 0}
          aria-label={`Move ${action.title} up`}
        >
          <ArrowUp className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMove(index, index + 1)}
          disabled={reorderPending || index === total - 1}
          aria-label={`Move ${action.title} down`}
        >
          <ArrowDown className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
