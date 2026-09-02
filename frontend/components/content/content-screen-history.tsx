import { useState } from 'react';
import { FileText, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { RunStatusValue } from '@/components/ui/badge-variants';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Drawer } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import type { ContentGenerationListItem, ContentGenerationStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { Pressable } from '@/components/ui/pressable';
import {
  isTerminalContentStatus,
  useContentGenerations,
} from '@/lib/content/use-content-generations';
import { textRole } from '@/components/ui/typography';

const STATUS_BADGE: Record<ContentGenerationStatus, RunStatusValue> = {
  queued: 'queued',
  leased: 'queued',
  running: 'running',
  retry_wait: 'running',
  succeeded: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function GenerationHistoryWorkspace({
  open,
  onOpenChange,
  generation,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generation: ReturnType<typeof useContentGenerations>;
}>) {
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title="Generation history"
        description="Open a previous draft from this project."
        className="max-w-xl"
      >
        <div className="grid gap-4">
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={
                generation.clearHistoryMutation.isPending ||
                !(generation.listQuery.data ?? []).some((item) =>
                  isTerminalContentStatus(item.status),
                )
              }
              onClick={() => setClearOpen(true)}
            >
              Clear history
            </Button>
          </div>
          <GenerationHistory
            items={generation.listQuery.data ?? []}
            loading={generation.listQuery.isLoading}
            selectedId={generation.selectedId}
            onSelect={(generationId) => {
              generation.setSelectedId(generationId);
              onOpenChange(false);
            }}
            onDelete={setDeleteId}
          />
        </div>
      </Drawer>
      <ClearHistoryDialog open={clearOpen} onOpenChange={setClearOpen} generation={generation} />
      <DeleteGenerationDialog
        generationId={deleteId}
        onGenerationIdChange={setDeleteId}
        generation={generation}
      />
    </>
  );
}

function ClearHistoryDialog({
  open,
  onOpenChange,
  generation,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generation: ReturnType<typeof useContentGenerations>;
}>) {
  const pending = generation.clearHistoryMutation.isPending;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title="Clear generation history?"
      description="This permanently deletes completed, failed, and cancelled drafts. Active drafts stay available."
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            Keep history
          </Button>
          <Button
            variant="destructive"
            pending={pending}
            pendingLabel="Clearing history"
            onClick={() =>
              generation.clearHistoryMutation.mutate(undefined, {
                onSuccess: () => onOpenChange(false),
              })
            }
          >
            Clear history
          </Button>
        </>
      }
    >
      <p className="text-secondary text-sm">This action cannot be undone.</p>
    </Dialog>
  );
}

function DeleteGenerationDialog({
  generationId,
  onGenerationIdChange,
  generation,
}: Readonly<{
  generationId: string | null;
  onGenerationIdChange: (generationId: string | null) => void;
  generation: ReturnType<typeof useContentGenerations>;
}>) {
  const pending = generation.deleteMutation.isPending;
  return (
    <Dialog
      open={generationId !== null}
      onOpenChange={(open) => !open && !pending && onGenerationIdChange(null)}
      title="Delete generation?"
      description="This permanently deletes the draft and its provider-attempt history."
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={() => onGenerationIdChange(null)}>
            Keep draft
          </Button>
          <Button
            variant="destructive"
            pending={pending}
            pendingLabel="Deleting draft"
            onClick={() => {
              if (!generationId) return;
              generation.deleteMutation.mutate(generationId, {
                onSuccess: () => onGenerationIdChange(null),
              });
            }}
          >
            Delete generation
          </Button>
        </>
      }
    >
      <p className="text-secondary text-sm">This action cannot be undone.</p>
    </Dialog>
  );
}

function GenerationHistory({
  items,
  loading,
  selectedId,
  onSelect,
  onDelete,
}: Readonly<{
  items: ContentGenerationListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (generationId: string) => void;
  onDelete: (generationId: string) => void;
}>) {
  return (
    <div data-component-id="content-history" className="min-w-0">
      {loading ? (
        <Skeleton className="h-24 w-full rounded-[var(--radius-control)]" />
      ) : (
        <HistoryItems
          items={items}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function HistoryItems({
  items,
  selectedId,
  onSelect,
  onDelete,
}: Readonly<{
  items: ContentGenerationListItem[];
  selectedId: string | null;
  onSelect: (generationId: string) => void;
  onDelete: (generationId: string) => void;
}>) {
  // The drawer already supplies the surrounding surface, so the empty state
  // stays compact and avoids nesting another card inside it.
  if (items.length === 0)
    return (
      <div className="text-muted grid justify-items-center gap-2 py-[var(--card-padding)] text-center">
        <FileText className="size-5" aria-hidden />
        <p className="text-sm">No generations yet.</p>
        <p className="text-xs">Your drafts will collect here.</p>
      </div>
    );
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2">
          <Pressable
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              'focus-ring hover:bg-background-alt flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-control)] border px-3.5 py-3 text-left text-sm transition-colors',
              item.id === selectedId
                ? 'border-accent-border bg-accent-soft'
                : 'border-border',
            )}
          >
            <span className={textRole('emphasis', 'text-foreground min-w-0 flex-1 truncate')}>
              {item.instruction_preview || 'Untitled generation'}
            </span>
            <Badge variant="run-status" value={STATUS_BADGE[item.status]}>
              {item.status.replace('_', ' ')}
            </Badge>
          </Pressable>
          {isTerminal(item.status) ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${item.instruction_preview || 'generation'}`}
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function isTerminal(status: ContentGenerationStatus) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}
