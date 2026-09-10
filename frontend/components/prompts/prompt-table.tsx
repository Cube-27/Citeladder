'use client';

import { Archive, Check, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TablePagination, useTablePage } from '@/components/ui/table-pagination';
import { Tooltip } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import type { Prompt, PromptStatus } from '@/lib/api/types';
import { buyerStageLabels, intentLabels } from '@/lib/prompts/forms';
import { formatRate } from '@/lib/visibility/dashboard';
import { changeLabel } from '@/lib/visibility/vocabulary';

/** What the latest run measured for one prompt, keyed by prompt id. */
export type PromptMeasurement = {
  visibilityRate: number | null;
  change: number | null;
  position: number | null;
};

/** Rows per page on the prompt table (client-side; the list arrives whole). */
const PAGE_SIZE = 10;

/**
 * Prompt table (F7). Dense analytics table with columns text / theme / stage /
 * intent / measured visibility / enabled and per-row actions (edit, delete,
 * enable/disable toggle, and — when `onSetStatus` is wired — archive or restore
 * transitions).
 *
 * The measured columns arrive as a map rather than being fetched here: the
 * prompt IS the object a reader is looking at, so its result belongs on this
 * row. It previously lived in a "Prompt analysis" card on the Visibility
 * dashboard, where the prompt was a detail of a measurement instead.
 * Client-side pagination footer
 * (mono indicator + ghost buttons) per the prompts frame. Purely
 * presentational — CRUD is delegated to callbacks owned by the page.
 */
export function PromptTable({
  prompts,
  onEdit,
  onDelete,
  onToggleEnabled,
  onSetStatus,
  busyId,
  measurements,
}: Readonly<{
  prompts: Prompt[];
  onEdit: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
  onToggleEnabled: (prompt: Prompt) => void;
  onSetStatus?: (prompt: Prompt, status: PromptStatus) => void;
  busyId?: string | null;
  /** Latest-run measurement per prompt id. Omitted before any run exists. */
  measurements?: ReadonlyMap<string, PromptMeasurement>;
}>) {
  // With no run there is nothing measured for ANY prompt, so the columns are
  // not drawn at all rather than filling with placeholders.
  const measured = Boolean(measurements?.size);
  const { page, setPage, pageCount, from, to } = useTablePage(prompts.length, PAGE_SIZE);
  const pagedPrompts = prompts.slice(from - 1, to);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prompt</TableHead>
            <TableHead>Theme</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Intent</TableHead>
            {measured ? <TableHead numeric>Visibility</TableHead> : null}
            {measured ? <TableHead numeric>Position</TableHead> : null}
            {measured ? <TableHead numeric>Change</TableHead> : null}
            <TableHead>Enabled</TableHead>
            <TableHead className="w-16 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedPrompts.map((prompt) => (
            <TableRow key={prompt.id}>
              <TableCell className="max-w-130 min-w-60">
                <Tooltip content={prompt.text}>
                  <span className="text-foreground line-clamp-2 block">{prompt.text}</span>
                </Tooltip>
              </TableCell>
              <TableCell className="max-w-45">
                {prompt.theme ? (
                  <Tooltip content={prompt.theme}>
                    <Badge variant="neutral" className="max-w-full">
                      <span className="min-w-0 truncate">{prompt.theme}</span>
                    </Badge>
                  </Tooltip>
                ) : (
                  <UnavailableValue state="not_set" />
                )}
              </TableCell>
              <TableCell className="text-secondary">
                {prompt.buyer_stage ? (
                  buyerStageLabels[prompt.buyer_stage]
                ) : (
                  <UnavailableValue state="not_set" />
                )}
              </TableCell>
              <TableCell className="text-secondary">{intentLabels[prompt.intent]}</TableCell>
              {measured ? <MeasuredCells measurement={measurements?.get(prompt.id)} /> : null}
              <TableCell>
                <Switch
                  checked={prompt.enabled}
                  label={`${prompt.enabled ? 'Disable' : 'Enable'} prompt`}
                  disabled={busyId === prompt.id}
                  onCheckedChange={() => onToggleEnabled(prompt)}
                />
              </TableCell>
              <TableCell className="text-right">
                <Dropdown>
                  <DropdownTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Prompt actions">
                      <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent align="end">
                    {onSetStatus && prompt.status === 'archived' ? (
                      <DropdownItem onSelect={() => onSetStatus(prompt, 'active')}>
                        <Check className="size-4" aria-hidden />
                        Restore
                      </DropdownItem>
                    ) : null}
                    <DropdownItem onSelect={() => onEdit(prompt)}>
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </DropdownItem>
                    {onSetStatus && prompt.status !== 'archived' ? (
                      <DropdownItem onSelect={() => onSetStatus(prompt, 'archived')}>
                        <Archive className="size-4" aria-hidden />
                        Archive
                      </DropdownItem>
                    ) : null}
                    <DropdownSeparator />
                    <DropdownItem
                      onSelect={() => onDelete(prompt)}
                      className="text-danger-text data-[highlighted]:bg-danger-bg"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Delete
                    </DropdownItem>
                  </DropdownContent>
                </Dropdown>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        pageCount={pageCount}
        from={from}
        to={to}
        total={prompts.length}
        noun="prompts"
        onPageChange={setPage}
      />
    </>
  );
}

/** A prompt's measured visibility, and its movement since the last run. */
function MeasuredCells({ measurement }: Readonly<{ measurement?: PromptMeasurement }>) {
  const change = changeLabel(measurement?.change);
  return (
    <>
      <TableCell numeric>
        {measurement ? (
          formatRate(measurement.visibilityRate)
        ) : (
          <UnavailableValue state="not_measured" />
        )}
      </TableCell>
      <TableCell numeric>
        {measurement?.position == null ? (
          <UnavailableValue state="not_measured" />
        ) : (
          `#${measurement.position.toFixed(1)}`
        )}
      </TableCell>
      <TableCell numeric>{change ?? <UnavailableValue state="not_measured" />}</TableCell>
    </>
  );
}
