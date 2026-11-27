import {
  Fragment,
  useState,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';

import {
  OptionText,
  type FilterDefinition,
  type FilterIcon,
  type FilterPages,
} from '@/components/ui/all-filters';
import { IconButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TRIGGER_BOX } from '@/components/ui/input';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { SearchField } from '@/components/ui/search-field';
import { Tooltip } from '@/components/ui/tooltip';
import { Bot, CalendarDays, ChevronDown, Folder, Globe, Tag, X, type IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

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
    label: string;
    value?: string;
    lead?: ReactNode;
    iconOnly?: boolean;
    active?: boolean;
    ref?: Ref<HTMLButtonElement>;
  }
>) {
  const name = value === undefined ? label : `${label}: ${value}`;
  return (
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
          'disabled:cursor-not-allowed disabled:opacity-disabled',
          iconOnly ? 'gap-1 px-0 pe-2' : 'gap-2 ps-control-x pe-2',
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
        <Icon icon={ChevronDown} size="flush" tone="placeholder" />
      </button>
    </Tooltip>
  );
}

const GLYPHS: Record<FilterIcon, IconGlyph> = {
  period: CalendarDays,
  engines: Bot,
  market: Globe,
  prompts: Tag,
  topic: Folder,
};

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

function filterLead(filter: FilterDefinition): ReactNode {
  if (!filter.icon) return null;
  const marks = filter.icon === 'engines' ? engineStack(filter) : null;
  if (marks) return marks;
  const Glyph = GLYPHS[filter.icon];
  return <Icon icon={Glyph} size="flush" />;
}

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

export function ValueChip({ filter }: Readonly<{ filter: FilterDefinition }>) {
  return (
    <Tooltip content={filter.label}>
      <span className="rounded-control text-body text-ink bg-state-fill min-h-control-md pe-tray-inset inline-flex max-w-full min-w-0 shrink-0 items-center gap-1 border border-transparent ps-3">
        <span className="min-w-0 truncate">{filter.valueLabel}</span>
        <IconButton
          icon={X}
          label={`Remove ${filter.label} filter`}
          shape="close"
          tooltip={false}
          onClick={filter.reset}
        />
      </span>
    </Tooltip>
  );
}

const SEARCH_FROM = 10;

type ChoiceFilter = Extract<FilterDefinition, { kind: 'choice' }>;

function isSearchable(filter: ChoiceFilter): boolean {
  const total = filter.groups.reduce((sum, group) => sum + group.options.length, 0);
  return filter.searchable ?? total > SEARCH_FROM;
}

export function FilterOptions({ filter }: Readonly<{ filter: FilterDefinition }>) {
  return (
    <>
      <MenuLabel>{filter.label}</MenuLabel>
      {filter.kind === 'choice' ? <ChoiceOptions filter={filter} /> : filter.content}
      {filter.isDefault ? null : (
        <>
          <MenuSeparator />
          <MenuItem onSelect={filter.reset}>Reset to {resetTarget(filter.defaultLabel)}</MenuItem>
        </>
      )}
    </>
  );
}

function resetTarget(label: string): string {
  const [first = '', second] = label.split(' ');
  const named = second === undefined || /^[A-Z]/.test(second) || /[A-Z]/.test(first.slice(1));
  return named ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

function ChoiceOptions({ filter }: Readonly<{ filter: ChoiceFilter }>) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const groups = needle
    ? filter.groups
        .map((group) => ({
          ...group,
          options: group.options.filter((option) => option.label.toLowerCase().includes(needle)),
        }))
        .filter((group) => group.options.length > 0)
    : filter.groups;
  return (
    <>
      {isSearchable(filter) ? (
        <div className="bg-raised z-raised sticky top-0 pb-1">
          <SearchField
            value={query}
            onValueChange={setQuery}
            aria-label={`Search ${filter.label.toLowerCase()}`}
            placeholder="Search"
            onKeyDown={searchKeys}
          />
        </div>
      ) : null}
      <MenuRadioGroup
        value={filter.value}
        onKeyDown={isSearchable(filter) ? backToSearch : undefined}
      >
        {groups.map((group, index) => (
          <Fragment key={group.label ?? `group-${index}`}>
            {index > 0 ? <MenuSeparator /> : null}
            {group.label ? <MenuLabel>{group.label}</MenuLabel> : null}
            {group.options.map((option) => (
              <MenuRadioItem
                key={option.value}
                value={option.value}
                onSelect={() => filter.onChange(option.value)}
              >
                <span className="flex min-w-0 items-center">
                  {option.mark ? (
                    <OptionText mark={option.mark} label={option.label} />
                  ) : (
                    <span className="min-w-0 truncate">{option.label}</span>
                  )}
                  {option.value === filter.defaultValue ? <DefaultHint /> : null}
                </span>
              </MenuRadioItem>
            ))}
          </Fragment>
        ))}
      </MenuRadioGroup>
      {groups.length === 0 ? <p className="text-body text-ink-2 px-2 py-2">No matches</p> : null}
      {filter.pages ? <PageSteps pages={filter.pages} /> : null}
    </>
  );
}

function PageSteps({ pages }: Readonly<{ pages: FilterPages }>) {
  if (!pages.canPrev && !pages.canNext) return null;
  const step = (move: () => void) => (event: Event) => {
    event.preventDefault();
    move();
  };
  return (
    <>
      <MenuSeparator />
      <MenuItem disabled={!pages.canPrev} onSelect={step(pages.onPrev)}>
        {pages.previousLabel}
      </MenuItem>
      <MenuItem disabled={!pages.canNext} onSelect={step(pages.onNext)}>
        {pages.nextLabel}
      </MenuItem>
    </>
  );
}

export function DefaultHint() {
  return (
    <span
      aria-hidden
      data-hint="Default"
      className="text-ink-2 text-caption ms-auto shrink-0 ps-4 after:content-[attr(data-hint)]"
    />
  );
}

export function focusFieldOnEntry(event: FocusEvent<HTMLDivElement>) {
  if (event.target !== event.currentTarget) return;
  const input = event.currentTarget.querySelector('input');
  if (input) queueMicrotask(() => input.focus());
}

export function menuFieldKeys(event: KeyboardEvent<HTMLInputElement>): boolean {
  if (event.key === 'Escape' || event.key === 'Tab') return false;
  if (event.key === 'ArrowLeft' && event.currentTarget.value === '') return false;
  event.stopPropagation();
  return true;
}

function backToSearch(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowUp') return;
  const first = event.currentTarget.querySelector('[role="menuitemradio"]');
  if (event.target !== first) return;
  event.preventDefault();
  event.currentTarget.closest('[role="menu"]')?.querySelector('input')?.focus();
}

function searchKeys(event: KeyboardEvent<HTMLInputElement>) {
  if (!menuFieldKeys(event) || event.key !== 'ArrowDown') return;
  event.preventDefault();
  const menu = event.currentTarget.closest('[role="menu"]');
  const first = menu?.querySelector<HTMLElement>('[role="menuitemradio"]');
  first?.focus();
}
