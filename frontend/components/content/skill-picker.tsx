'use client';

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
import { Skeleton } from '@/components/ui/skeleton';
import type { ContentSkillView } from '@/lib/api/content';

/** Display order and copy for the channel groups the catalog reports. */
const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  web: 'Web',
  social: 'Social',
  video: 'Video',
  community: 'Community',
  email: 'Email',
};

const CHANNEL_ORDER = ['web', 'social', 'video', 'community', 'email'] as const;

/**
 * Compact, catalog-driven format picker.
 *
 * The server still owns every skill. The workspace shows only its high-level
 * channels until a user opens one, keeping a growing catalog from turning the
 * composer into a wall of controls.
 */
export function SkillPicker({
  skills,
  value,
  onChange,
  disabled = false,
  loading = false,
}: Readonly<{
  skills: readonly ContentSkillView[];
  value: string;
  onChange: (skillId: string) => void;
  disabled?: boolean;
  loading?: boolean;
}>) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-2" aria-busy="true">
        {CHANNEL_ORDER.map((channel) => (
          <Skeleton key={channel} className="h-9 w-24 rounded-[var(--radius-control)]" />
        ))}
      </div>
    );
  }

  const selectedSkill = skills.find((skill) => skill.id === value);
  const groups = CHANNEL_ORDER.map((channel) => ({
    channel,
    label: CHANNEL_LABELS[channel] ?? channel,
    items: skills.filter((skill) => skill.channel === channel),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="grid gap-2" aria-label="Content format">
      <span className="text-secondary text-sm font-medium">Format</span>
      <div className="flex flex-wrap gap-2">
        {groups.map((group) => {
          const active = selectedSkill?.channel === group.channel;
          return (
            <Dropdown key={group.channel}>
              <DropdownTrigger asChild>
                <Button
                  variant={active ? 'tonal' : 'secondary'}
                  size="sm"
                  disabled={disabled}
                  data-component-id="content-format-channel"
                  aria-label={
                    active ? `${group.label}: ${selectedSkill.label}` : `${group.label} formats`
                  }
                >
                  <span>{group.label}</span>
                  {active ? (
                    <span className="max-w-44 truncate font-normal">{selectedSkill.label}</span>
                  ) : null}
                  <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                </Button>
              </DropdownTrigger>
              <DropdownContent className="w-[min(22rem,calc(100vw-2rem))]">
                <DropdownLabel>{group.label} formats</DropdownLabel>
                <DropdownRadioGroup value={value} onValueChange={onChange}>
                  {group.items.map((skill) => (
                    <DropdownRadioItem
                      key={skill.id}
                      value={skill.id}
                      disabled={disabled}
                      className="items-start py-2.5"
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium">{skill.label}</span>
                        <span className="text-secondary text-xs leading-relaxed">
                          {skill.description}
                        </span>
                      </span>
                    </DropdownRadioItem>
                  ))}
                </DropdownRadioGroup>
              </DropdownContent>
            </Dropdown>
          );
        })}
      </div>
    </div>
  );
}
