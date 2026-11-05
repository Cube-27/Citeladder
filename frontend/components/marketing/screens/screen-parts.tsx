import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { BrandMark } from '@/components/ui/brand-mark';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Card, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';

import { ENGINE_KEYS, ENGINE_NAMES, type Change } from './demo-data';

/**
 * The parts every product screen shares. A screen is an app content crop at
 * a fixed natural size built from the app's own components; it is a still,
 * so its controls are drawn, never wired.
 */

/**
 * A screen's natural width and height, two independent lists (docs/design.md,
 * "Website product images"): screens.css has one `cl-screen--w*` class per
 * width and one `cl-screen--h*` class per height, so a new size adds a value
 * here and a class there.
 */
type ScreenWidth = 480 | 640 | 800 | 960 | 1200;
type ScreenHeight = 320 | 360 | 400 | 500 | 600 | 680;

export function ScreenRoot({
  name,
  width,
  height,
  children,
}: Readonly<{ name: string; width: ScreenWidth; height: ScreenHeight; children: ReactNode }>) {
  return (
    <div
      className={cn(
        'cl-screen',
        `cl-screen--w${width}`,
        `cl-screen--h${height}`,
        `cl-screen--${name}`,
      )}
    >
      {children}
    </div>
  );
}

/** The toolbar row above a screen's content: tabs or a search on the left, meta or actions on the right. */
export function ScreenBar({ start, end }: Readonly<{ start: ReactNode; end?: ReactNode }>) {
  return (
    <div className="cl-screen-bar">
      <div className="cl-screen-bar-side">{start}</div>
      {end && <div className="cl-screen-bar-side">{end}</div>}
    </div>
  );
}

/**
 * The app's Button, drawn: its face on a span, so a screen inside a linked
 * card never nests a control in a link.
 */
export function ScreenButton({
  variant = 'secondary',
  icon,
  label,
  children,
}: Readonly<{ variant?: ButtonVariant; icon?: LucideIcon; label?: string; children?: ReactNode }>) {
  return (
    <Button asChild variant={variant}>
      <span aria-label={label}>
        {icon && <Icon icon={icon} />}
        {children}
      </span>
    </Button>
  );
}

export function ScreenMeta({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="cl-screen-meta">{children}</span>;
}

/**
 * The app's tab track, drawn: the first item named in `selected` lifts onto
 * surface, and a count follows its label in brackets (D16).
 */
export function ScreenTabs({
  items,
  selected,
}: Readonly<{ items: readonly Readonly<{ label: string; count?: number }>[]; selected: string }>) {
  return (
    <span className={TAB_TRACK}>
      {items.map((item) => (
        <span key={item.label} className={tabClasses(item.label === selected)}>
          {item.label}
          {item.count === undefined ? null : <ControlCount count={item.count} />}
        </span>
      ))}
    </span>
  );
}

export function ScreenEngine({ engine }: Readonly<{ engine: EngineKey }>) {
  return (
    <span className="cl-screen-engine">
      <EngineMark engine={engine} placement="inline" />
      {ENGINE_NAMES[engine]}
    </span>
  );
}

/** Every engine's mark in one row: the engines that named the brand in ink, the rest muted. */
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

/** A brand or domain with its mark. The demo brands are fictional, so the mark is their letter. */
export function ScreenSite({ label, mono = false }: Readonly<{ label: string; mono?: boolean }>) {
  return (
    <span className="cl-screen-site">
      <BrandMark name={label} placement="inline" />
      <span className={cn('cl-screen-site-text', mono && 'cl-screen-mono')}>{label}</span>
    </span>
  );
}

export function ScreenNote({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="cl-screen-note">{children}</p>;
}

type ColsLayout = 'halves' | 'main-aside' | 'aside-main' | 'main-side';

export function ScreenCols({
  layout,
  children,
}: Readonly<{ layout: ColsLayout; children: ReactNode }>) {
  return <div className={cn('cl-screen-cols', `cl-screen-cols--${layout}`)}>{children}</div>;
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

/** A figure: its eyebrow label, the value with an optional unit, and its change. */
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
  /** A line under the title saying what the card holds. */
  meta?: string;
  children: ReactNode;
}>) {
  return (
    <Card>
      {title && (
        <CardHeader actions={action}>
          {eyebrow && <CardEyebrow>{eyebrow}</CardEyebrow>}
          <CardTitle>{title}</CardTitle>
          {meta && <ScreenNote>{meta}</ScreenNote>}
        </CardHeader>
      )}
      {children}
    </Card>
  );
}

/** Column widths a screen table uses, so a table's columns never follow its rows. */
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
  /** The tracked brand's own row, tinted. */
  own?: (row: Row) => boolean;
  /** The row whose detail the screen shows. */
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

/** A table in a card: its title row and a line saying what it counts. */
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
        <CardTitle>{title}</CardTitle>
        {meta && <ScreenNote>{meta}</ScreenNote>}
      </CardHeader>
      {children}
    </Card>
  );
}

/** A code sample as the app draws it: a file bar over the code. */
export function ScreenCode({ filename, code }: Readonly<{ filename: string; code: string }>) {
  return (
    <figure className="cl-screen-code">
      <figcaption className="cl-screen-code-bar">{filename}</figcaption>
      <pre className="cl-screen-code-pre">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
