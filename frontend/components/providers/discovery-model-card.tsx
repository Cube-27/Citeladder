'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Card, CardContent, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dropdown,
  DropdownContent,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { inputClasses } from '@/components/ui/input';
import { discoveryModelOptions, type DiscoveryModelOption } from '@/lib/providers/catalog';
import type { ProviderCatalog } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'citeladder.discovery-model';

function readStored(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStored(value: string) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function optionKey(option: DiscoveryModelOption): string {
  return `${option.logical_engine}:${option.transport_provider}:${option.transport_model}`;
}

/**
 * Discovery / analysis model selection (F8, plumbing-only, design.md §9.5).
 *
 * A separate control that maps to the roadmap `DiscoveryModelConfig`. The choice
 * is persisted locally so the plumbing is exercised, but the audit pipeline does
 * not read it yet. Options are driven off the catalog's approved routes.
 */
export function DiscoveryModelCard({
  catalog,
}: Readonly<{ catalog: ProviderCatalog | undefined }>) {
  const options = discoveryModelOptions(catalog);
  const [selected, setSelected] = useState<string>(() => readStored());

  const selectedOption = options.find((opt) => optionKey(opt) === selected);
  const currentLabel = selectedOption ? selectedOption.label : 'Use default';

  const handleSelect = (val: string) => {
    setSelected(val);
    writeStored(val);
  };

  return (
    <Card>
      <CardHeader>
        <CardEyebrow>Discovery / analysis</CardEyebrow>
        <CardTitle>Discovery model configuration</CardTitle>
        <p className="text-secondary text-xs">
          Used for prompt discovery and answer analysis. Saved to your workspace; the audit pipeline
          does not use it yet.
        </p>
      </CardHeader>
      <CardContent className="grid max-w-md gap-1.5">
        <span className={eyebrowClasses}>Model</span>
        <Dropdown>
          <DropdownTrigger
            id="discovery-model"
            aria-label="Discovery model"
            className={cn(
              inputClasses,
              'flex w-full items-center justify-between text-left font-normal cursor-pointer select-none',
            )}
          >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown className="text-muted size-4 shrink-0" aria-hidden />
          </DropdownTrigger>
          <DropdownContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
            <DropdownRadioGroup value={selected} onValueChange={handleSelect}>
              <DropdownRadioItem value="">Use default</DropdownRadioItem>
              {options.map((option) => {
                const key = optionKey(option);
                return (
                  <DropdownRadioItem key={key} value={key}>
                    {option.label}
                  </DropdownRadioItem>
                );
              })}
            </DropdownRadioGroup>
          </DropdownContent>
        </Dropdown>
      </CardContent>
    </Card>
  );
}
