import {
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type ReactNode,
} from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Icon, LineMark } from '@/components/ui/icon';
import { Pressable, ROW_FACE } from '@/components/ui/pressable';
import { ProjectLink } from '@/components/ui/project-link';
import { Spinner } from '@/components/ui/spinner';
import { ClampText } from '@/components/ui/clamp-text';

import { Check, ChevronDown, ChevronRight, type IconGlyph } from '@/lib/icons';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

function listRowClasses() {
  return cn(ROW_FACE.base, ROW_FACE.rest);
}

export function OptionRow({
  title,
  caption,
  selected,
  pending = false,
  disabled,
  onSelect,
}: Readonly<{
  title: ReactNode;
  caption?: ReactNode;
  selected: boolean;
  pending?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}>) {
  return (
    <Pressable
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      look={selected ? 'option-selected' : 'option'}
    >
      <span className="flex min-w-0 flex-1 items-start gap-3">
        <span className="min-w-0 flex-1">
          <ClampText text="body" tone={disabled ? 'ink-2' : undefined}>
            {title}
          </ClampText>
          {caption ? (
            <ClampText text="caption" numeric>
              {caption}
            </ClampText>
          ) : null}
        </span>
        {pending ? (
          <LineMark>
            <Spinner tone="ink-2" />
          </LineMark>
        ) : null}
        {selected && !pending ? (
          <LineMark>
            <Icon icon={Check} tone="ink" />
          </LineMark>
        ) : null}
      </span>
    </Pressable>
  );
}

export function DisclosureList({ children }: Readonly<{ children: ReactNode }>) {
  return <ul className="divide-rule grid min-w-0 divide-y">{children}</ul>;
}

export function DisclosureRow({
  title,
  meta,
  children,
}: Readonly<{
  title: ReactNode;
  meta: ReactNode;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li className="grid min-w-0">
      <Pressable
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        look="disclosure"
      >
        <span className="phone:flex-wrap phone:gap-y-1 phone:py-2 flex min-w-0 flex-1 items-center gap-3">
          <ClampText phoneWrap text="label" className="phone:basis-full min-w-0">
            {title}
          </ClampText>
          <span className="text-caption text-ink-2 flex shrink-0 items-center gap-3">{meta}</span>
        </span>
        <Icon icon={ChevronDown} tone="ink-2" flip={open} />
      </Pressable>
      <div
        id={panelId}
        hidden={!open}
        className="bg-well rounded-control mb-2 grid min-w-0 gap-3 px-4 py-3"
      >
        {open ? children : null}
      </div>
    </li>
  );
}

export function TreeList({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <ul aria-label={label} className="flex min-w-0 flex-col gap-0.5">
      {children}
    </ul>
  );
}

export function TreeItem({
  label,
  count,
  nested = false,
  actions,
}: Readonly<{
  label: string;
  count?: number;
  nested?: boolean;
  actions?: ReactNode;
}>) {
  return (
    <li
      data-tree-item=""
      className={cn(
        'text-ink flex min-h-control-md min-w-0 items-center gap-2 ps-3 pe-0.5',
        nested && 'ms-3',
        listRowClasses(),
      )}
    >
      <ClampText text="body" className="flex-1">
        {label}
      </ClampText>
      {typeof count === 'number' ? (
        <span className="text-caption text-ink-2 shrink-0 tabular-nums">{formatCount(count)}</span>
      ) : null}
      {actions}
    </li>
  );
}

const TREE_INDENT = ['', 'ms-4', 'ms-8', 'ms-12', 'ms-16', 'ms-20'] as const;
const treeIndent = (depth: number) => TREE_INDENT[Math.min(depth, TREE_INDENT.length - 1)];

export function TreeCheckOption({
  label,
  checked,
  disabled = false,
  depth = 0,
  badge,
  onCheckedChange,
}: Readonly<{
  label: string;
  checked: boolean;
  disabled?: boolean;
  depth?: number;
  badge?: ReactNode;
  onCheckedChange: (checked: boolean) => void;
}>) {
  return (
    <li className={cn('flex min-h-control-md min-w-0 items-center gap-2', treeIndent(depth))}>
      <Checkbox
        label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      {badge}
    </li>
  );
}

export function TreeItemForm({
  nested = false,
  onSubmit,
  children,
}: Readonly<{ nested?: boolean; onSubmit: () => void; children: ReactNode }>) {
  return (
    <li>
      <form
        className={cn('flex items-center gap-2', nested && 'ms-3')}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
      </form>
    </li>
  );
}

export function ItemRow({
  icon,
  title,
  caption,
  status,
  actions,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'li'>, 'className' | 'children' | 'title'> & {
    icon: ReactNode;
    title: ReactNode;
    caption: ReactNode;
    status: ReactNode;
    actions: ReactNode;
  }
>) {
  return (
    <li {...props} className="@container min-w-0">
      <div className="phone:grid-cols-list-row-phone grid-cols-list-row @list-wide:grid-cols-list-row-wide grid items-start gap-3">
        <span className="flex size-5 items-center justify-center self-start">{icon}</span>
        <div className="grid min-w-0 gap-0.5">
          <p className="text-label text-ink">{title}</p>
          <div
            data-item-caption=""
            className="text-caption text-ink-2 phone:flex-wrap flex min-w-0 items-baseline gap-1"
          >
            {caption}
          </div>
        </div>
        <div className="text-caption text-ink-2 phone:col-start-2 flex min-h-5 min-w-0 items-center gap-2">
          {status}
        </div>
        <div className="@list-wide:col-auto @list-wide:h-5 col-start-2 -col-end-1 flex flex-wrap items-center gap-2">
          {actions}
        </div>
      </div>
    </li>
  );
}

export function LinkListRow({
  icon,
  href,
  label,
  linkLabel,
  description,
  end,
}: Readonly<{
  icon: IconGlyph;
  href: string;
  label: ReactNode;
  linkLabel: string;
  description: ReactNode;
  end?: ReactNode;
}>) {
  const detailId = useId();
  return (
    <li className="hover:overlay-hover min-h-row relative flex min-w-0 items-center">
      <span className="flex min-w-0 flex-1 items-start gap-3">
        <LineMark>
          <Icon icon={icon} tone="ink-2" />
        </LineMark>
        <span className="text-body text-ink flex min-w-0 flex-1 flex-col gap-0.5">
          <ProjectLink
            href={href}
            aria-label={linkLabel}
            aria-describedby={end ? `${detailId} ${detailId}-end` : detailId}
            look="row-title"
          >
            {label}
          </ProjectLink>
          <span id={detailId} className="text-ink-2 phone:sr-only line-clamp-2 min-w-0">
            {description}
          </span>
        </span>
        {end ? (
          <LineMark>
            <span
              id={`${detailId}-end`}
              className="text-caption text-ink-2 shrink-0 whitespace-nowrap"
            >
              {end}
            </span>
          </LineMark>
        ) : null}
        <LineMark>
          <Icon icon={ChevronRight} tone="ink-2" />
        </LineMark>
      </span>
    </li>
  );
}
