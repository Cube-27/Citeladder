import { FileText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { RunStatusValue } from '@/components/ui/badge-variants';
import { Skeleton } from '@/components/ui/skeleton';
import type { ContentGenerationListItem, ContentGenerationStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { Pressable } from '@/components/ui/pressable';

const STATUS_BADGE: Record<ContentGenerationStatus, RunStatusValue> = {
  queued: 'queued',
  leased: 'queued',
  running: 'running',
  retry_wait: 'running',
  succeeded: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function GenerationHistory({
  items,
  loading,
  selectedId,
  onSelect,
}: Readonly<{
  items: ContentGenerationListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (generationId: string) => void;
}>) {
  return (
    <div data-component-id="content-history" className="min-w-0">
      {loading ? (
        <Skeleton className="h-24 w-full rounded-sm" />
      ) : (
        <HistoryItems items={items} selectedId={selectedId} onSelect={onSelect} />
      )}
    </div>
  );
}

function HistoryItems({
  items,
  selectedId,
  onSelect,
}: Readonly<{
  items: ContentGenerationListItem[];
  selectedId: string | null;
  onSelect: (generationId: string) => void;
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
        <li key={item.id}>
          <Pressable
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              'focus-ring hover:bg-background-alt flex w-full items-center gap-3 rounded-sm border px-3.5 py-3 text-left text-sm transition-colors',
              item.id === selectedId
                ? 'border-accent-border bg-accent-soft font-medium'
                : 'border-border',
            )}
          >
            <span className="text-foreground min-w-0 flex-1 truncate font-medium">
              {item.prompt_preview || 'Untitled generation'}
            </span>
            <Badge variant="run-status" value={STATUS_BADGE[item.status]}>
              {item.status.replace('_', ' ')}
            </Badge>
          </Pressable>
        </li>
      ))}
    </ul>
  );
}
