import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import {
  Bot,
  CalendarDays,
  ChevronDown,
  Folder,
  Globe,
  Tag,
  X,
  type LucideIcon,
} from 'lucide-react';

import type { FilterDefinition, FilterIcon } from '@/components/ui/all-filters';
import { focusFieldOnEntry, FilterOptions } from '@/components/ui/filter-options';
import { TRIGGER_BOX } from '@/components/ui/input';
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * FilterTrigger — a filter's chip: sized to its content, it prints the value
 * only ("Last 30 days"); the filter's name is in its tooltip and accessible
 * name ("Period: Last 30 days") and heads its menu. A chip with a `lead` (an
 * icon filter) at its default prints only that icon and the chevron.
 * Its width follows its value (owner, 2026-11-18): the row is left-aligned
 * and ends in its status text, so nothing else moves.
 *
 * Use it as `<MenuTrigger asChild><FilterTrigger …/></MenuTrigger>`; it
 * forwards the ref and the trigger's props to the button.
 */
export function FilterTrigger({
  label,
  value,
  lead,
  iconOnly = false,
  active = false,
  className,
  ref,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
    /** The filter's name ("Status"): tooltip and accessible name, never printed. */
    label: string;
    value?: string;
    /** The icon before the value (an icon filter's glyph or engine marks). */
    lead?: ReactNode;
    /** Print only the lead: an icon filter at its default. */
    iconOnly?: boolean;
    /** A choice moved off its default (`data-active`). */
    active?: boolean;
    ref?: Ref<HTMLButtonElement>;
  }
>) {
  const name = value === undefined ? label : `${label}: ${value}`;
  return (
    // Always wrapped, so moving off the default keeps the same button (and its focus).
    <Tooltip content={name} describe={false}>
      <button
        ref={ref}
        type="button"
        data-active={active || undefined}
        aria-label={name}
        className={cn(
          TRIGGER_BOX,
          'focus-input flex w-auto max-w-full min-w-0 shrink-0 items-center text-left',
          'press',
          'disabled:cursor-not-allowed disabled:opacity-45',
          // Icon only, it is an icon control: no padding, its glyphs inset like IconButton's.
          iconOnly ? 'gap-1 px-0 pe-2' : 'gap-2 ps-3 pe-2',
          className,
        )}
        {...props}
      >
        {lead ? (
          <span className={cn('text-ink-2 flex shrink-0 items-center', iconOnly && 'ps-2')}>
            {lead}
          </span>
        ) : null}
        {iconOnly || value === undefined ? null : (
          <span data-filter-value="" className="text-ink min-w-0 truncate">
            {value}
          </span>
        )}
        {/* It turns while the list is open (globals.css, every dropdown's chevron). */}
        <ChevronDown className="text-ink-2 size-4 shrink-0" aria-hidden />
      </button>
    </Tooltip>
  );
}

const GLYPHS: Record<FilterIcon, LucideIcon> = {
  period: CalendarDays,
  engines: Bot,
  market: Globe,
  prompts: Tag,
  topic: Folder,
};

/** The engine marks a chip shows: the chosen one, or the first three while every engine counts. */
function engineStack(filter: FilterDefinition): ReactNode {
  if (filter.kind !== 'choice') return null;
  const options = filter.groups.flatMap((group) => group.options);
  const shown = filter.isDefault
    ? options.filter((option) => option.mark).slice(0, 3)
    : options.filter((option) => option.value === filter.value && option.mark);
  if (shown.length === 0) return null;
  return (
    <span className="flex items-center gap-0.5 [&_svg]:size-3.5">
      {shown.map((option) => (
        <span key={option.value} className="flex">
          {option.mark}
        </span>
      ))}
    </span>
  );
}

/** An icon filter's lead: its glyph, or for engines their marks. */
function filterLead(filter: FilterDefinition): ReactNode {
  if (!filter.icon) return null;
  const marks = filter.icon === 'engines' ? engineStack(filter) : null;
  if (marks) return marks;
  const Glyph = GLYPHS[filter.icon];
  return <Glyph className="size-4" aria-hidden />;
}

/** One filter as its own chip in the row, opening its options. */
export function FilterChip({
  filter,
  align = 'start',
}: Readonly<{ filter: FilterDefinition; align?: 'start' | 'end' }>) {
  const lead = filterLead(filter);
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterTrigger
          label={filter.label}
          value={filter.valueLabel}
          lead={lead}
          iconOnly={lead !== null && filter.isDefault}
          active={!filter.isDefault}
          disabled={filter.disabled}
        />
      </MenuTrigger>
      <MenuContent align={align} onFocus={focusFieldOnEntry}>
        <FilterOptions filter={filter} />
      </MenuContent>
    </Menu>
  );
}

/**
 * A filter set inside Filters, after the button: its value and a × that puts
 * it back to its default; the filter's name is in the tooltip.
 */
export function ValueChip({ filter }: Readonly<{ filter: FilterDefinition }>) {
  return (
    <Tooltip content={filter.label}>
      <span className="face bg-raised border-rule rounded-control type-body text-ink inline-flex min-h-[var(--control-md)] max-w-full min-w-0 shrink-0 items-center gap-1 border ps-3 pe-1">
        <span className="min-w-0 truncate">{filter.valueLabel}</span>
        <button
          type="button"
          aria-label={`Remove ${filter.label} filter`}
          onClick={filter.reset}
          className="focus-ring rounded-mark text-ink-2 hover:text-ink hover:overlay-hover flex size-5.5 shrink-0 items-center justify-center"
        >
          <X className="size-3" aria-hidden />
        </button>
      </span>
    </Tooltip>
  );
}
