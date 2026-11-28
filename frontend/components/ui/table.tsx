import {
  useRef,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';

import { Absence } from '@/components/ui/absence';
import { Checkbox } from '@/components/ui/checkbox';
import { ClampText, UrlCutParts, useCut } from '@/components/ui/clamp-text';
import type { ScrollRegionProps } from '@/components/ui/scroll-edges';
import { Tag } from '@/components/ui/tag';
import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import { TEXT_TONE_CLASS, type TextTone } from '@/components/ui/text-role';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import {
  type Absent,
  formatDisplayTimestamp,
  isAbsent,
  readableUrl,
  urlCellText,
} from '@/lib/format';
import { cn } from '@/lib/utils';

import './table.css';
import './table-phone.css';

const tableHeadClasses = 'text-caption text-ink-2 whitespace-nowrap';
export function Table({
  children,
  className,
  fixed = false,
  wrapperClassName,
  wrapperRef,
  region,
  ariaLabel,
  ariaLabelledBy,
}: Readonly<{
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  fixed?: boolean;
  wrapperClassName?: string;
  wrapperRef?: Ref<HTMLDivElement>;
  region?: ScrollRegionProps;
}>) {
  return (
    <div
      {...region}
      ref={wrapperRef}
      className={cn(
        'table-frame bg-panel relative w-full max-w-full min-w-0 overflow-auto [[data-public-surface]_&]:rounded-card',
        wrapperClassName,
      )}
    >
      <table
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          'text-body text-ink w-full border-separate border-spacing-0',
          fixed && 'table-fixed',
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  children,
  className,
  ...props
}: Readonly<HTMLAttributes<HTMLTableSectionElement>>) {
  return (
    <thead {...props} className={cn(className)}>
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className,
  ...props
}: Readonly<HTMLAttributes<HTMLTableSectionElement>>) {
  return (
    <tbody {...props} className={cn(className)}>
      {children}
    </tbody>
  );
}

export function TableRow({
  children,
  className,
  highlight,
  onOpen,
  well = false,
  dimmed = false,
  ...props
}: Readonly<
  Omit<HTMLAttributes<HTMLTableRowElement>, 'onClick'> & {
    highlight?: boolean;
    onOpen?: () => void;
    well?: boolean;
    dimmed?: boolean;
  }
>) {
  const pressable = onOpen !== undefined;
  return (
    <tr
      {...props}
      onClick={
        onOpen
          ? (event) => {
              if (isRowSurfaceClick(event)) onOpen();
            }
          : undefined
      }
      data-pressable={pressable || undefined}
      className={cn(
        'h-row transition-colors duration-fast',
        pressable && 'cursor-pointer',
        pressable &&
          !highlight &&
          '[[data-public-surface]_&]:not-aria-selected:hover:overlay-hover',
        '[[data-public-surface]_&]:aria-selected:overlay-selected',
        highlight && '[[data-public-surface]_&]:bg-accent-wash',
        well && 'bg-well hover:bg-well',
        dimmed && 'opacity-disabled',
        className,
      )}
      data-you={highlight || undefined}
    >
      {children}
    </tr>
  );
}

const desktopOnlyClasses = 'hidden desktop:table-cell';

type CellOptions = { numeric?: boolean; desktopOnly?: boolean };

export function TableHead({
  children,
  className,
  numeric,
  desktopOnly,
  stackOnPhone = false,
  scope = 'col',
  ...props
}: Readonly<ThHTMLAttributes<HTMLTableCellElement> & CellOptions & { stackOnPhone?: boolean }>) {
  return (
    <th
      scope={scope}
      {...props}
      className={cn(
        tableHeadClasses,
        'aria-[sort=ascending]:text-ink aria-[sort=descending]:text-ink',
        'bg-well sticky top-0 z-raised h-table-head px-cell-x text-left align-middle',
        numeric && 'tabular-nums text-right',
        desktopOnly && desktopOnlyClasses,
        className,
        stackOnPhone &&
          'phone:whitespace-normal phone:[&>span]:flex-col phone:[&>span]:gap-1 phone:[&_.truncate]:whitespace-normal text-center',
      )}
    >
      {children}
    </th>
  );
}

function isPlainText(children: ReactNode) {
  if (typeof children === 'string' || typeof children === 'number') return true;
  return (
    Array.isArray(children) &&
    children.length > 0 &&
    children.every((part) => typeof part === 'string' || typeof part === 'number')
  );
}

const cellClasses = ({ numeric, desktopOnly }: CellOptions) =>
  cn(
    'text-body text-ink px-cell-x py-cell-y text-left align-middle',
    numeric && 'whitespace-nowrap text-right tabular-nums',
    desktopOnly && desktopOnlyClasses,
  );

function CellContent({
  children,
  numeric,
}: Readonly<{ children: ReactNode | Absent; numeric?: boolean }>) {
  if (isAbsent(children)) return <Absence state={children.absent} />;
  return !numeric && isPlainText(children) ? <ClampText>{children}</ClampText> : children;
}

export const mutedWhenMissing = (value: number | null): TextTone | undefined =>
  value === null ? 'ink-2' : undefined;

export function TableCell({
  children,
  numeric,
  desktopOnly,
  nested,
  tone,
  tight = false,
  wrap,
  alignTop = false,
  ground = 'table',
  ...props
}: Readonly<
  Omit<TdHTMLAttributes<HTMLTableCellElement>, 'children' | 'className'> &
    CellOptions & {
      children?: ReactNode | Absent;
      nested?: boolean | 2;
      tone?: TextTone;
      ground?: 'table' | 'well';
      tight?: boolean;
      wrap?: 'nowrap' | 'normal';
      alignTop?: boolean;
    }
>) {
  return (
    <td
      {...props}
      data-tone={tone}
      className={cn(
        cellClasses({ numeric, desktopOnly }),
        nested === true && 'ps-[calc(var(--spacing-cell-x)_+_var(--spacing-indent))] cell-indent',
        nested === 2 && 'ps-[calc(var(--spacing-cell-x)_+_var(--spacing-indent-2))] cell-indent-2',
        tone && TEXT_TONE_CLASS[tone],
        tight && 'py-1',
        wrap === 'nowrap' && 'whitespace-nowrap',
        wrap === 'normal' && 'whitespace-normal',
        alignTop && 'align-top',
        ground === 'well' && 'bg-well table-ground-well',
      )}
    >
      <CellContent numeric={numeric}>{children}</CellContent>
    </td>
  );
}

export function TableGroupRow({ span, children }: Readonly<{ span: number; children: ReactNode }>) {
  return (
    <TableRow>
      <TableCell colSpan={span} ground="well">
        {children}
      </TableCell>
    </TableRow>
  );
}

export function TableCellLines({
  primary,
  secondary,
  secondaryTooltip,
  title = false,
}: Readonly<{
  primary: ReactNode;
  secondary?: ReactNode;
  secondaryTooltip?: ReactNode;
  title?: boolean;
}>) {
  return (
    <span data-cell-lines="" className="flex min-w-0 items-baseline gap-2">
      <ClampText rowTitle text={title ? 'body' : undefined} box="fixed-full">
        {primary}
      </ClampText>
      {secondary ? (
        <ClampText tooltip={secondaryTooltip} tone="ink-2">
          {secondary}
        </ClampText>
      ) : null}
    </span>
  );
}

export function YouTag() {
  return <Tag strong>You</Tag>;
}

export function isRowSurfaceClick(event: MouseEvent<HTMLTableRowElement>): boolean {
  const row = event.currentTarget;
  if (!(event.target instanceof Element) || !row.contains(event.target)) return false;
  for (let node: Element | null = event.target; node && node !== row; node = node.parentElement)
    if (node.matches(ROW_CONTROL)) return false;
  return true;
}

const ROW_CONTROL =
  'a, button, input, label, [role="button"], [role="checkbox"], [role="switch"], [data-row-control]';

export function TableActionsCell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <td data-row-control="" className={cn(cellClasses({}), 'whitespace-nowrap')}>
      <span className="flex items-center justify-end gap-2">{children}</span>
    </td>
  );
}

export function TableSelectCell({
  label,
  describedBy,
  checked,
  onCheckedChange,
  disabled,
}: Readonly<{
  label: string;
  describedBy?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean, range: boolean) => void;
  disabled?: boolean;
}>) {
  const range = useRef(false);
  return (
    <td
      data-row-control=""
      className={cellClasses({})}
      onClickCapture={(event) => {
        range.current = event.shiftKey;
      }}
    >
      <Checkbox
        aria-label={label}
        aria-describedby={describedBy}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next === true, range.current)}
      />
    </td>
  );
}

export function TableRowHeader({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <th scope="row" className={cn(cellClasses({}), 'text-body text-ink', className)}>
      {isPlainText(children) ? <ClampText rowTitle>{children}</ClampText> : children}
    </th>
  );
}

export function UrlText({ url, origin = null }: Readonly<{ url: string; origin?: string | null }>) {
  const text = urlCellText(url, origin);
  const ref = useRef<HTMLSpanElement>(null);
  const cut = useCut(ref, anyPartCut);
  return (
    <Tooltip content={readableUrl(url)} shouldOpen={anyPartCut}>
      <span
        ref={ref}
        data-url-text=""
        data-truncated={cut || undefined}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={cut ? 0 : undefined}
        className="rounded-mark flex min-w-0 whitespace-nowrap"
      >
        <UrlCutParts text={text} />
      </span>
    </Tooltip>
  );
}

function anyPartCut(node: HTMLElement) {
  return [...node.querySelectorAll(':scope > span')].some(isTextCut);
}

export function TableTime({
  value,
  fallback = null,
}: Readonly<{ value: string | null | undefined; fallback?: ReactNode }>) {
  const timeZone = useDisplayTimeZone();
  if (!value) return fallback;
  return (
    <ClampText tone="ink-2" numeric>
      <time dateTime={value}>{formatDisplayTimestamp(value, timeZone)}</time>
    </ClampText>
  );
}
