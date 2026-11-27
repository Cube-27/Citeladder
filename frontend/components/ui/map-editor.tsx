import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { Plus } from '@/lib/icons';

export function MapGridHead({ lead, heads }: Readonly<{ lead: string; heads: readonly string[] }>) {
  return (
    <div
      aria-hidden
      className="column-split:grid-cols-offering-map column-split:gap-0 border-rule column-split:grid h-table-head text-caption-strong text-ink-2 bg-table-head grid hidden items-center gap-1 border-b"
    >
      <span className="px-panel-inset">{lead}</span>
      {heads.map((head) => (
        <span key={head} className="px-3">
          {head}
        </span>
      ))}
      <span />
    </div>
  );
}

export function MapGridRow({
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'li'>, 'className' | 'style'>>) {
  return (
    <li
      {...props}
      className="column-split:grid-cols-offering-map column-split:gap-0 border-rule column-split:p-0 grid gap-1 border-b p-2"
    >
      {children}
    </li>
  );
}

export function MapGridLead({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="column-split:px-panel-inset column-split:py-3 flex min-w-0 items-start justify-between gap-2 px-2 pt-1">
      <span className="text-label text-ink min-w-0 break-words">{label}</span>
      {children}
    </div>
  );
}

export function MapGridCell({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="column-split:border-s column-split:border-rule column-split:p-1 min-w-0">
      <p aria-hidden className="text-caption text-ink-2 column-split:hidden px-2 pt-1">
        {label}
      </p>
      {children}
    </div>
  );
}

export function MapGridEnd({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="column-split:flex column-split:border-s column-split:border-rule hidden items-start justify-center pt-2">
      {children}
    </div>
  );
}

export function MapAddRow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="focus-frame border-rule px-panel-inset flex min-h-10 items-center gap-2 border-t border-transparent">
      <Icon icon={Plus} tone="ink-2" />
      {children}
    </div>
  );
}

export function BareInput(
  props: Readonly<Omit<ComponentPropsWithoutRef<'input'>, 'className' | 'style'>>,
) {
  return (
    <input
      {...props}
      className="text-body text-ink placeholder:text-ink-placeholder min-h-8 flex-1 bg-transparent"
    />
  );
}

export function FactRow({
  label,
  count,
  children,
}: Readonly<{ label: string; count?: string; children: ReactNode }>) {
  return (
    <div className="column-split:grid-cols-label-value grid min-w-0 items-start gap-x-3 gap-y-1">
      <div className="column-split:pt-2.5">
        <p className="text-label text-ink">{label}</p>
        {count ? <p className="text-caption text-ink-2 tabular-nums">{count}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function StickySaveBar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bg-panel border-rule sticky bottom-0 flex justify-end gap-2 border-t py-3">
      {children}
    </div>
  );
}
