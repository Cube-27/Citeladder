'use client';

import { FilterTrigger } from '@/components/ui/filter-row';
import {
  Dropdown,
  DropdownContent,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownTrigger,
} from '@/components/ui/dropdown';

export function AnalysisChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}>) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <FilterTrigger
          label={label}
          hideLabel
          value={options.find((option) => option.value === value)?.label ?? label}
        />
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>{label}</DropdownLabel>
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
