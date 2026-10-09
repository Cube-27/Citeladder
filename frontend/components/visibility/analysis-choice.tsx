'use client';

import type { LucideIcon } from 'lucide-react';

import { FilterTrigger } from '@/components/ui/filter-row';
import {
  Dropdown,
  DropdownContent,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownTrigger,
} from '@/components/ui/dropdown';

/**
 * A single-choice filter menu: the trigger names the filter by its visible
 * value (`label` stays for assistive tech), the menu lists the options.
 */
export function AnalysisChoice<T extends string>({
  label,
  menuLabel = label,
  value,
  defaultValue,
  options,
  onChange,
  icon,
}: Readonly<{
  /** The trigger's accessible name prefix, e.g. "Select date range". */
  label: string;
  /** The heading inside the menu; defaults to `label`. */
  menuLabel?: string;
  value: T;
  /** The unfiltered value; any other value marks the trigger active. */
  defaultValue?: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  icon?: LucideIcon;
}>) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <FilterTrigger
          label={label}
          hideLabel
          value={options.find((option) => option.value === value)?.label ?? label}
          active={defaultValue !== undefined && value !== defaultValue}
          icon={icon}
        />
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>{menuLabel}</DropdownLabel>
        <DropdownRadioGroup value={value}>
          {options.map((option) => (
            <DropdownRadioItem
              key={option.value}
              value={option.value}
              onSelect={() => onChange(option.value)}
            >
              {option.label}
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}
