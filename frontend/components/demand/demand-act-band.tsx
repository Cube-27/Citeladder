'use client';

import { ArrowRight } from 'lucide-react';

import { SignalChip } from '@/components/demand/demand-signal-table';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Button } from '@/components/ui/button';
import {
  ClampText,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import type { DemandSignal } from '@/lib/api/demand';
import { actionGroups } from '@/lib/demand/signals';

/**
 * "Act on this": the signals promoted into Actions, one row per page's Action.
 * Unpromoted signals stay in the table below for reading and asking.
 */
export function DemandActBand({ signals }: Readonly<{ signals: readonly DemandSignal[] }>) {
  const groups = actionGroups(signals);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="demand-act" className="grid gap-3">
      <EditorialSectionHeader headingId="demand-act" title="Act on this" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Page</TableHead>
            <TableHead>Signals</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.actionId}>
              <TableCell className="max-w-96">
                <ClampText lines={1} className={textRole('itemTitle')}>
                  {group.page ?? 'No page resolved'}
                </ClampText>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  {group.signalTypes.map((type) => (
                    <SignalChip key={type} signalType={type} />
                  ))}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" asChild>
                    <ProjectLink
                      href={`/agent/actions/${group.actionId}`}
                      aria-label={`Open the Action for ${group.page ?? 'an unresolved page'}`}
                    >
                      Open Action
                      <ArrowRight className="size-3.5" aria-hidden />
                    </ProjectLink>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
