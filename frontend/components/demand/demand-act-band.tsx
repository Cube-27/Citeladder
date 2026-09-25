'use client';

import { ArrowRight } from 'lucide-react';

import { SignalChip } from '@/components/demand/demand-signal-table';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Button } from '@/components/ui/button';
import { panelClasses } from '@/components/ui/panel';
import { SectionTitle, textRole } from '@/components/ui/typography';
import type { DemandSignal } from '@/lib/api/demand';
import { actionGroups } from '@/lib/demand/signals';

/**
 * "Act on this": the signals promoted into Actions, one entry per page's
 * Action. Unpromoted signals stay in the table below for reading and asking.
 */
export function DemandActBand({ signals }: Readonly<{ signals: readonly DemandSignal[] }>) {
  const groups = actionGroups(signals);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="demand-act" className="grid gap-3">
      <SectionTitle id="demand-act">Act on this</SectionTitle>
      <ul className="grid gap-2">
        {groups.map((group) => (
          <li
            key={group.actionId}
            className={panelClasses(
              { pad: 'compact' },
              'flex flex-col gap-2 sm:flex-row sm:items-center',
            )}
          >
            <div className="grid min-w-0 flex-1 gap-1.5">
              <span className={textRole('bodyStrong', 'break-all')}>
                {group.page ?? 'No page resolved'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {group.signalTypes.map((type) => (
                  <SignalChip key={type} signalType={type} />
                ))}
              </div>
            </div>
            <Button variant="secondary" size="sm" asChild className="self-start sm:self-center">
              <ProjectLink
                href={`/agent/actions/${group.actionId}`}
                aria-label={`Open the Action for ${group.page ?? 'an unresolved page'}`}
              >
                Open Action
                <ArrowRight className="size-3.5" aria-hidden />
              </ProjectLink>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
