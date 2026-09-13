import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownContent,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownTrigger,
} from '@/components/ui/dropdown';

export function OpportunityFilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (value: T) => void;
}>) {
  const selectedLabel = options.find((option) => option.key === value)?.label ?? value;
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`${label}: ${selectedLabel}`}>
          <span className="text-muted">{label}</span>
          <span>{selectedLabel}</span>
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="start" aria-label={label}>
        <DropdownLabel>{label}</DropdownLabel>
        <DropdownRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownRadioItem key={option.key} value={option.key}>
              {option.label}
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}
