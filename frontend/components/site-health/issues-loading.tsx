import { Skeleton } from '@/components/ui/skeleton';

const SUMMARY_PLACEHOLDERS = ['summary-a', 'summary-b', 'summary-c'] as const;
const FILTER_PLACEHOLDERS = ['search', 'page-kind', 'finding-class', 'severity'] as const;
const ISSUE_PLACEHOLDERS = ['issue-a', 'issue-b', 'issue-c', 'issue-d'] as const;

export function IssuesLoading() {
  return (
    <div aria-busy="true" className="grid min-w-0 gap-[var(--page-section-gap)]">
      <output aria-label="Loading issues…" className="sr-only">
        Loading issues…
      </output>

      <div className="border-border-subtle flex flex-wrap gap-x-8 gap-y-3 border-b pb-3">
        {SUMMARY_PLACEHOLDERS.map((placeholder) => (
          <div key={placeholder} className="flex items-baseline gap-1.5">
            <Skeleton className="h-6 w-8" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {FILTER_PLACEHOLDERS.map((placeholder, index) => (
          <Skeleton
            key={placeholder}
            className={index === 0 ? 'h-9 w-full max-w-64' : 'h-9 w-32'}
          />
        ))}
      </div>

      <div className="border-border grid min-h-[32rem] min-w-0 items-start overflow-hidden rounded-[var(--radius-card)] border min-[701px]:grid-cols-[var(--pane-list-detail)]">
        <div className="border-border-subtle divide-border-subtle flex min-w-0 divide-x overflow-hidden border-b min-[701px]:grid min-[701px]:divide-x-0 min-[701px]:divide-y min-[701px]:border-r min-[701px]:border-b-0">
          {ISSUE_PLACEHOLDERS.map((placeholder) => (
            <div
              key={placeholder}
              className="grid w-[272px] shrink-0 gap-3 px-4 py-4 min-[701px]:w-full"
            >
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>

        <div className="min-w-0">
          <header className="border-border-subtle grid gap-3 border-b p-[var(--card-padding)]">
            <Skeleton className="h-6 w-2/3" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-8 w-36" />
          </header>
          <div className="grid gap-[var(--workspace-gap)] p-[var(--card-padding)]">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-20 w-full" />
            <div className="border-border-subtle grid gap-3 border-y py-3">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
