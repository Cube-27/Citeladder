'use client';

import { Palette } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import {
  Dropdown,
  DropdownContent,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import {
  ACCENT_OPTIONS,
  currentAccentTheme,
  isAccentTheme,
  setAccentTheme,
  subscribeAccentTheme,
} from '@/lib/theme/accent-theme';

export function AccentThemePicker() {
  const selected = useSyncExternalStore(subscribeAccentTheme, currentAccentTheme, () => 'emerald');

  return (
    <Dropdown>
      <DropdownTrigger
        aria-label="Accent color"
        title="Accent color"
        className="focus-ring text-muted hover:bg-accent-soft hover:text-accent-text grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] transition-colors"
      >
        <Palette className="size-4" aria-hidden />
      </DropdownTrigger>
      <DropdownContent align="end" className="w-44">
        <DropdownLabel>Accent color</DropdownLabel>
        <DropdownRadioGroup
          value={selected}
          onValueChange={(value) => {
            if (isAccentTheme(value)) setAccentTheme(value);
          }}
        >
          {ACCENT_OPTIONS.map((option) => (
            <DropdownRadioItem
              key={option.value}
              value={option.value}
              data-accent-choice={option.value}
            >
              <span className="accent-theme-swatch" aria-hidden />
              {option.label}
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}
