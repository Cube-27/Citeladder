import type { ReactNode } from 'react';

import { Button, type ButtonVariant } from '@/components/ui/button';
import { Card, CardEyebrow, CardHeader } from '@/components/ui/card';
import { Delta } from '@/components/ui/delta';
import { EngineMark, type EngineKey } from '@/components/ui/engine-mark';
import { Icon } from '@/components/ui/icon';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ControlCount, TAB_TRACK, tabClasses } from '@/components/ui/tabs';
import type { IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { ENGINE_KEYS, ENGINE_NAMES, type Change } from './demo-data';
import './screen-parts.css';

export function ScreenButton({
  variant = 'secondary',
  icon,
  label,
  children,
}: Readonly<{ variant?: ButtonVariant; icon?: IconGlyph; label?: string; children?: ReactNode }>) {
  return (
    <Button asChild variant={variant}>
      <span aria-label={label}>
        {icon && <Icon icon={icon} />}
        {children}
      </span>
    </Button>
  );
}

export function ScreenTabs({
  items,
  selected,
}: Readonly<{ items: readonly Readonly<{ label: string; count?: number }>[]; selected: string }>) {
  return (
    <span className={cn(TAB_TRACK, 'cl-screen-tabs')}>
      {items.map((item) => (
        <span key={item.label} className={tabClasses(item.label === selected)}>
          {item.label}
          {item.count === undefined ? null : <ControlCount count={item.count} />}
        </span>
      ))}
    </span>
  );
}

export function ScreenEngineMarks({ on }: Readonly<{ on: readonly EngineKey[] }>) {
  return (
    <span className="cl-screen-marks">
      {ENGINE_KEYS.map((engine) => {
        const named = on.includes(engine);
        return (
          <span key={engine} className={cn('cl-screen-mark', !named && 'is-off')}>
            <EngineMark engine={engine} placement="inline" />
            <span className="sr-only">{`${ENGINE_NAMES[engine]}, ${named ? 'named' : 'not named'}`}</span>
          </span>
        );
      })}
    </span>
  );
}

export function ScreenSite({ label, mono = false }: Readonly<{ label: string; mono?: boolean }>) {
  return (
    <span className="cl-screen-site">
      <span className={cn('cl-screen-site-text', mono && 'cl-screen-mono')}>{label}</span>
    </span>
  );
}

function ScreenNote({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="cl-screen-note">{children}</p>;
}

export function ScreenCols({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="cl-screen-cols">{children}</div>;
}

export function ScreenStack({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="cl-screen-stack">{children}</div>;
}

export function ScreenDelta({ change, period }: Readonly<{ change: Change; period?: string }>) {
  return (
    <Delta
      value={change.value}
      unit={change.unit}
      precision={change.precision}
      policy={change.policy}
      context={period}
    />
  );
}

export function ScreenStat({
  label,
  value,
  unit,
  change,
  period = 'vs last week',
}: Readonly<{ label: string; value: string; unit?: string; change?: Change; period?: string }>) {
  return (
    <div className="cl-screen-stat">
      <span className="type-eyebrow">{label}</span>
      <span className="cl-screen-stat-value">
        {value}
        {unit && <span className="cl-screen-stat-unit">{unit}</span>}
      </span>
      {change && <ScreenDelta change={change} period={period} />}
    </div>
  );
}

function ScreenCardTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="cl-screen-card-title">{children}</p>;
}

export function ScreenChartCard({
  title,
  controls,
  footnote,
  children,
}: Readonly<{ title: string; controls?: ReactNode; footnote?: string; children: ReactNode }>) {
  return (
    <Card>
      <CardHeader
        actions={controls && <span className="cl-screen-controls contents">{controls}</span>}
      >
        <ScreenCardTitle>{title}</ScreenCardTitle>
      </CardHeader>
      <div className="text-ink grid min-w-0 gap-y-6">
        <div className="min-w-0">{children}</div>
        {footnote && <ScreenNote>{footnote}</ScreenNote>}
      </div>
    </Card>
  );
}

export function ScreenCard({
  eyebrow,
  title,
  action,
  meta,
  children,
}: Readonly<{
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
  meta?: string;
  children: ReactNode;
}>) {
  return (
    <Card>
      {title && (
        <CardHeader actions={action}>
          {eyebrow && <CardEyebrow>{eyebrow}</CardEyebrow>}
          <ScreenCardTitle>{title}</ScreenCardTitle>
          {meta && <ScreenNote>{meta}</ScreenNote>}
        </CardHeader>
      )}
      {children}
    </Card>
  );
}

type ColumnWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type ScreenColumn<Row> = Readonly<{
  header: string;
  width?: ColumnWidth;
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
}>;

export function ScreenTable<Row>({
  caption,
  rows,
  rowKey,
  columns,
  own,
  selected,
}: Readonly<{
  caption: string;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  columns: readonly ScreenColumn<Row>[];
  own?: (row: Row) => boolean;
  selected?: (row: Row) => boolean;
}>) {
  return (
    <Table fixed ariaLabel={caption}>
      <colgroup>
        {columns.map((column) => (
          <col
            key={column.header}
            className={column.width ? `cl-screen-col--${column.width}` : undefined}
          />
        ))}
      </colgroup>
      <TableHeader>
        <tr>
          {columns.map((column) => (
            <TableHead key={column.header} numeric={column.numeric}>
              {column.header}
            </TableHead>
          ))}
        </tr>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={rowKey(row)}
            highlight={own?.(row)}
            aria-selected={selected ? selected(row) : undefined}
          >
            {columns.map((column) => (
              <TableCell key={column.header} numeric={column.numeric}>
                <span className="cl-screen-cell">{column.cell(row)}</span>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ScreenTableCard({
  eyebrow,
  title,
  action,
  meta,
  children,
}: Readonly<{
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  meta?: string;
  children: ReactNode;
}>) {
  return (
    <Card>
      <CardHeader actions={action}>
        {eyebrow && <CardEyebrow>{eyebrow}</CardEyebrow>}
        <ScreenCardTitle>{title}</ScreenCardTitle>
        {meta && <ScreenNote>{meta}</ScreenNote>}
      </CardHeader>
      {children}
    </Card>
  );
}
