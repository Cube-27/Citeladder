import { Skeleton } from '@/components/ui/skeleton';

export function AiReferralsSkeleton() {
  return (
    <div className="grid gap-[var(--workspace-gap)]" aria-hidden>
      <div className="grid gap-[var(--workspace-gap)] lg:grid-cols-2">
        {[0, 1].map((index) => (
          <Skeleton key={index} className="h-72" />
        ))}
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}
