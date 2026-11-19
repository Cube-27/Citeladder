import type { ReactNode } from 'react';

import { MenuCheckboxItem } from '@/components/ui/menu';

/**
 * The five frequent filters that draw as an icon in the control row: the
 * period or measurement (calendar), engines (their marks), market (globe),
 * branded prompts (tag) and topic (folder). Any other filter is a value chip
 * or lives in Filters.
 */
export type FilterIcon = 'period' | 'engines' | 'market' | 'prompts' | 'topic';

/** One choice in a filter's menu; `mark` is a 16px glyph before its label (an engine's mark). */
type FilterOption<T extends string = string> = Readonly<{
  value: T;
  label: string;
  mark?: ReactNode;
}>;

/** A run of options under an optional small label ("Answer engines"). */
export type FilterOptionGroup<T extends string = string> = Readonly<{
  label?: string;
  options: readonly FilterOption<T>[];
}>;

type FilterBase = Readonly<{
  /** Stable key, unique in the row. */
  id: string;
  /** The filter's name: the chip's tooltip and the menu's heading, "Surface". */
  label: string;
  /** What the filter is set to now, the chip's text: "All surfaces". */
  valueLabel: string;
  /** Whether the filter is at its unfiltered value; the others are counted and cleared. */
  isDefault: boolean;
  /** The unfiltered value's label, for "Reset to all surfaces". */
  defaultLabel: string;
  /** Puts the filter back to its unfiltered value. */
  reset: () => void;
  /** Draws the filter as an icon chip in the row (`FilterBar` keeps at most four). */
  icon?: FilterIcon;
  /** The page's placement puts it in Filters; the row takes it only when it is the one left. */
  inFilters?: boolean;
  /**
   * The data window a period reads, at the row's end while its chip shows
   * only its icon: "Latest run · 18 Nov 09:12". Defaults to `valueLabel`.
   */
  windowLabel?: string;
  /** Offered but not applicable to this view: drawn disabled, so the row keeps its place. */
  disabled?: boolean;
}>;

/**
 * One filter of a control row. `choice` lists its options with a check on
 * the selected one (build it with `choiceFilter`); `custom` draws its own
 * menu body (menu items from `components/ui/menu`) under the filter's name.
 */
export type FilterDefinition = FilterBase &
  (
    | Readonly<{
        kind: 'choice';
        value: string;
        defaultValue: string;
        groups: readonly FilterOptionGroup[];
        onChange: (value: string) => void;
        /** A search box above the options; on by default past ten options. */
        searchable?: boolean;
      }>
    | Readonly<{ kind: 'custom'; content: ReactNode }>
  );

/**
 * A single-choice filter, typed by its values: the menu hands back only a
 * value it offered, so `onChange` receives a `T`.
 */
export function choiceFilter<T extends string>({
  id,
  label,
  value,
  defaultValue,
  groups,
  onChange,
  searchable,
  valueLabel,
  icon,
  windowLabel,
  disabled,
}: Readonly<{
  id: string;
  label: string;
  value: T;
  /** The unfiltered value. */
  defaultValue: T;
  groups: readonly FilterOptionGroup<T>[];
  onChange: (value: T) => void;
  searchable?: boolean;
  /** Overrides the selected option's label (a value the list no longer carries). */
  valueLabel?: string;
  icon?: FilterIcon;
  windowLabel?: string;
  disabled?: boolean;
}>): FilterDefinition {
  const options = groups.flatMap((group) => group.options);
  const labelOf = (key: T) => options.find((option) => option.value === key)?.label ?? label;
  return {
    kind: 'choice',
    id,
    label,
    value,
    defaultValue,
    valueLabel: valueLabel ?? labelOf(value),
    isDefault: value === defaultValue,
    defaultLabel: labelOf(defaultValue),
    reset: () => onChange(defaultValue),
    icon,
    windowLabel,
    disabled,
    groups,
    searchable,
    onChange: (raw) => {
      const picked = options.find((option) => option.value === raw);
      if (picked) onChange(picked.value);
    },
  };
}

/**
 * The one date-window filter: every reporting window reads "Period" in the
 * bar, so a reader learns one control for products, visibility and traffic.
 */
export function rangeFilter<T extends string>({
  value,
  defaultValue,
  options,
  onChange,
}: Readonly<{
  value: T;
  defaultValue: T;
  options: readonly FilterOption<T>[];
  onChange: (value: T) => void;
}>): FilterDefinition {
  return choiceFilter({
    id: 'range',
    label: 'Period',
    icon: 'period',
    value,
    defaultValue,
    groups: [{ options }],
    onChange,
  });
}

const EVERY = '__all__';

/** A single-choice filter whose unset value is `null` and reads "All …" in the menu. */
export function singleFilter({
  id,
  label,
  allLabel,
  value,
  options,
  onChange,
  icon,
}: Readonly<{
  id: string;
  label: string;
  allLabel: string;
  value: string | null;
  options: readonly FilterOption<string>[];
  onChange: (value: string | null) => void;
  icon?: FilterIcon;
}>): FilterDefinition {
  return choiceFilter({
    id,
    label,
    icon,
    value: value ?? EVERY,
    defaultValue: EVERY,
    groups: [{ options: [{ value: EVERY, label: allLabel }, ...options] }],
    onChange: (next) => onChange(next === EVERY ? null : next),
  });
}

/**
 * A multi-select filter: a check per option, any number on, none on meaning
 * unfiltered. The menu stays open while the reader picks.
 */
export function manyFilter<T extends string>({
  id,
  label,
  allLabel,
  values,
  options,
  onChange,
  icon,
}: Readonly<{
  id: string;
  label: string;
  /** The value shown while nothing is checked: "All intents". */
  allLabel: string;
  values: readonly T[];
  options: readonly FilterOption<T>[];
  onChange: (values: T[]) => void;
  icon?: FilterIcon;
}>): FilterDefinition {
  const chosen = new Set<string>(values);
  const picked = options.filter((option) => chosen.has(option.value));
  const [only] = picked;
  return {
    kind: 'custom',
    id,
    label,
    icon,
    valueLabel: picked.length > 1 ? `${picked.length} selected` : (only?.label ?? allLabel),
    isDefault: picked.length === 0,
    defaultLabel: allLabel,
    reset: () => onChange([]),
    content: options.map((option) => (
      <MenuCheckboxItem
        key={option.value || 'unspecified'}
        checked={chosen.has(option.value)}
        onSelect={(event) => {
          event.preventDefault();
          onChange(
            chosen.has(option.value)
              ? values.filter((value) => value !== option.value)
              : [...values, option.value],
          );
        }}
      >
        {option.mark ? <OptionText mark={option.mark} label={option.label} /> : option.label}
      </MenuCheckboxItem>
    )),
  };
}

/** An option's mark and label on one line. */
export function OptionText({ mark, label }: Readonly<{ mark: ReactNode; label: string }>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="text-ink flex size-4 shrink-0 items-center justify-center">{mark}</span>
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
