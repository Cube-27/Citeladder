'use client';

import { ChevronDown } from 'lucide-react';
import type { CrawlSchedule, CrawlScheduleCadence } from '@citeladder/contracts';

import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { Icon } from '@/components/ui/icon';
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';

type Choice = 'off' | CrawlScheduleCadence;

const CHOICES: ReadonlyArray<{ value: Choice; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const SKIPPED: Partial<Record<NonNullable<CrawlSchedule['last_outcome']>, string>> = {
  crawl_already_active: 'Last run skipped: a crawl was already running.',
  site_health_fetches_exhausted: 'Last run skipped: no page fetches left this period.',
  failed: 'Last run could not start a crawl. It will try again.',
};

function choiceOf(schedule: CrawlSchedule | undefined): Choice {
  return schedule?.enabled ? schedule.cadence : 'off';
}

/**
 * Scheduled crawls beside Run new crawl: off, weekly or monthly. Each run
 * reruns the newest crawl's scope and settings, as Recrawl does, and uses the
 * plan's page fetches like any crawl.
 */
export function CrawlScheduleControl({
  schedule,
  pending,
  onChange,
}: Readonly<{
  /** Undefined while the schedule loads. */
  schedule: CrawlSchedule | undefined;
  pending: boolean;
  onChange: (choice: Readonly<{ enabled: boolean; cadence: CrawlScheduleCadence }>) => void;
}>) {
  const current = choiceOf(schedule);
  const label = CHOICES.find((choice) => choice.value === current)?.label ?? 'Off';
  const skipped =
    schedule?.enabled && schedule.last_outcome ? SKIPPED[schedule.last_outcome] : null;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="secondary"
          disabled={!schedule || pending}
          aria-label={`Crawl schedule: ${label}`}
        >
          {pending ? 'Saving…' : `Schedule: ${label}`}
          <Icon icon={ChevronDown} />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>Rerun the latest crawl automatically</MenuLabel>
        <MenuRadioGroup
          value={current}
          onValueChange={(next) => {
            const choice = CHOICES.find((option) => option.value === next)?.value;
            if (!choice || choice === current) return;
            onChange(
              choice === 'off'
                ? { enabled: false, cadence: schedule?.cadence ?? 'weekly' }
                : { enabled: true, cadence: choice },
            );
          }}
        >
          {CHOICES.map((choice) => (
            <MenuRadioItem key={choice.value} value={choice.value}>
              {choice.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        {schedule?.enabled ? (
          <>
            <MenuSeparator />
            <MenuLabel>
              Next crawl <DisplayTime value={schedule.next_run_at} dateOnly />
            </MenuLabel>
            {skipped ? <MenuLabel>{skipped}</MenuLabel> : null}
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
