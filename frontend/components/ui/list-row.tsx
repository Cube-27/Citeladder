import { Check, ChevronDown } from 'lucide-react';
import {
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type ReactNode,
} from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Spinner } from '@/components/ui/spinner';
import { ClampText } from '@/components/ui/clamp-text';
import { pressableRowClasses } from '@/components/ui/open-row-skeleton';
import { textRole } from '@/components/ui/typography';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The one selected-row treatment for a selectable list beside its detail
 * (catalog tree, issue list).
 *
 * Selected takes the shared selected tint and the foreground ink, the same
 * filled face as a selected tab, segment or navigation row (owner,
 * 2026-11-04: active states are buttons, not marks). Unselected rows take the
 * neutral hover and pressed tints. The state itself must also be in the markup — the caller
 * sets `aria-current` (navigation-like lists), `aria-selected` (a
 * listbox/grid option) or `aria-pressed` (a toggle); colour is never the only
 * signal.
 *
 * Layout (padding, gap, grid) stays with the caller: rows differ in anatomy,
 * not in state.
 */
function listRowClasses({ selected = false }: Readonly<{ selected?: boolean }> = {}) {
  return cn(
    'relative rounded-control transition-[background-color,color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
    // Three states, three overlays: selected never looks hovered.
    selected
      ? 'overlay-selected text-ink'
      : 'text-ink-2 hover:overlay-hover hover:text-ink active:overlay-pressed',
  );
}

/**
 * One choice in a list where pressing the row IS the commit (a property to
 * import, an account to use): a title, one caption line, and at the end a
 * spinner while the choice is being applied or the check once it is. The row
 * owns its padding (12 across, 8 down) and the pressed state.
 */
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
      className={cn(
        listRowClasses({ selected }),
        pressableRowClasses,
        'disabled:pointer-events-none disabled:[&_.type-body]:text-ink-2',
      )}
    >
      <span className="min-w-0 flex-1">
        <ClampText className={textRole('body')}>{title}</ClampText>
        {caption ? <ClampText className="type-caption tabular-nums">{caption}</ClampText> : null}
      </span>
      {pending ? <Spinner className="text-ink-2" /> : null}
      {/* Selected is a mark that is not colour: the check, in ink. */}
      {selected && !pending ? <Icon icon={Check} className="text-ink" /> : null}
    </Pressable>
  );
}

/** A ruled list of `DisclosureRow`s. */
export function DisclosureList({ children }: Readonly<{ children: ReactNode }>) {
  return <ul className="divide-rule grid min-w-0 divide-y">{children}</ul>;
}

/**
 * A row that opens in place (an issue on a page): the title over a subline of
 * its facts, 56 tall, with a chevron at the end and `aria-expanded`. Open, its
 * body sits under it on `well` (12 down, 16 across, radius 6). It bleeds 12
 * past its list, so every row's text starts on one edge.
 */
export function DisclosureRow({
  title,
  meta,
  children,
}: Readonly<{
  title: ReactNode;
  meta: ReactNode;
  /** Rendered only while open. */
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
        className={cn(listRowClasses(), pressableRowClasses, 'min-h-10')}
      >
        <span className="grid min-w-0 flex-1 gap-1">
          <ClampText className={textRole('label', 'text-ink')}>{title}</ClampText>
          <span className={textRole('caption', 'text-ink-2 flex flex-wrap items-center gap-3')}>
            {meta}
          </span>
        </span>
        <Icon
          icon={ChevronDown}
          className={cn('text-ink-2 shrink-0 transition-transform', open && 'rotate-180')}
        />
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

/** A tree list: its `TreeItem`s and `TreeItemForm`s, 2 apart. */
export function TreeList({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <ul aria-label={label} className="flex min-w-0 flex-col gap-0.5">
      {children}
    </ul>
  );
}

/**
 * A tree list's row (topics and their subtopics, in the dialog that manages
 * them): one control tall — the label, truncated with the whole name behind
 * a tooltip, an optional count, and icon actions (`IconButton`s) at the
 * row's end. A nested item (one level deep) is indented 12 from its parent.
 * The row owns the height, the indent and the gaps; the page passes names,
 * counts and actions.
 */
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
        'text-ink flex min-h-[var(--control-md)] min-w-0 items-center gap-2 ps-3 pe-0.5',
        nested && 'ms-3',
        listRowClasses(),
      )}
    >
      <ClampText className="type-body flex-1">{label}</ClampText>
      {typeof count === 'number' ? (
        <span className="type-caption shrink-0 tabular-nums">{formatCount(count)}</span>
      ) : null}
      {actions}
    </li>
  );
}

/** A tree option's indent per depth, 16 a level (category paths stop at six levels). */
const TREE_INDENT = ['', 'ms-4', 'ms-8', 'ms-12', 'ms-16', 'ms-20'] as const;
const treeIndent = (depth: number) => TREE_INDENT[Math.min(depth, TREE_INDENT.length - 1)];

/**
 * A tree list's row that is a box to tick (a proposed category to keep):
 * the checkbox and its label, an optional badge after it, indented 16 a
 * level of `depth`.
 */
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
    <li
      className={cn('flex min-h-[var(--control-md)] min-w-0 items-center gap-2', treeIndent(depth))}
    >
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

/**
 * A tree item's name edited in place: the field and its submit on one row,
 * at the item's own indent so the edit stays where the name was.
 */
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

/**
 * A two-line item in a list its card frames (a data source and its
 * property), one grid: a 20px icon, the text column (the title, which wraps
 * and never cuts, over one caption line), the item's status, then its
 * actions; 12 down, flush with the column's edges, 12 between parts. Below a 640px list the
 * actions wrap to a third line under the text, left-aligned with it.
 */
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
    <li
      {...props}
      className="grid grid-cols-[20px_minmax(0,1fr)_fit-content(40%)] items-center gap-3 py-3 @[640px]:grid-cols-[20px_minmax(0,1fr)_fit-content(40%)_auto]"
    >
      <span className="flex size-5 items-center justify-center self-start">{icon}</span>
      <div className="grid min-w-0 gap-0.5">
        <p className={textRole('label', 'text-ink')}>{title}</p>
        <div
          data-item-caption=""
          className={textRole('caption', 'text-ink-2 flex min-w-0 items-baseline gap-1')}
        >
          {caption}
        </div>
      </div>
      <div className={textRole('caption', 'text-ink-2 flex min-w-0 items-center gap-2')}>
        {status}
      </div>
      <div className="col-[2/-1] flex flex-wrap items-center gap-2 @[640px]:col-auto">
        {actions}
      </div>
    </li>
  );
}
