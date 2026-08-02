'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { engineLabel, transportLabel } from '@/lib/providers/catalog';
import type { Execution } from '@/lib/api/types';
import { executionBadgeValue, executionStatusLabel } from '@/lib/runs/status';

/**
 * Executions table for a run (F10, design.md §9.7).
 *
 * One row per execution/queue task: prompt index + repetition (mono), the
 * engine badge (logical + transport), status badge, and latency (mono).
 * Succeeded rows open the evidence drawer without leaving the run.
 */
export function ExecutionsTable({
  executions,
  onSelectEvidence,
}: Readonly<{ executions: Execution[]; onSelectEvidence: (execution: Execution) => void }>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Prompt</TableHead>
          <TableHead>Engine</TableHead>
          <TableHead>Status</TableHead>
          <TableHead numeric>Latency</TableHead>
          <TableHead className="sr-only">Evidence</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {executions.map((execution) => (
          <TableRow key={execution.id}>
            <TableCell>
              <span
                className="text-foreground block max-w-[42ch] truncate text-sm"
                title={execution.prompt_text}
              >
                {execution.prompt_text || `Prompt #${execution.prompt_index + 1}`}
              </span>
              <span className="mono text-muted text-xs">rep {execution.repetition}</span>
            </TableCell>
            <TableCell>
              <span className="text-foreground text-sm">
                {engineLabel(execution.logical_engine)}
              </span>
              <span className="text-muted ml-1.5 text-xs">
                {transportLabel(execution.transport_provider)}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant="status" value={executionBadgeValue(execution.status)}>
                {executionStatusLabel(execution.status)}
              </Badge>
            </TableCell>
            <TableCell numeric className="mono">
              {execution.latency_ms == null ? '—' : `${execution.latency_ms} ms`}
            </TableCell>
            <TableCell>
              {execution.status === 'succeeded' ? (
                <button
                  type="button"
                  onClick={() => onSelectEvidence(execution)}
                  className="text-accent-text text-sm font-medium hover:underline"
                >
                  Evidence
                </button>
              ) : (
                <span className="text-subtle text-sm">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
