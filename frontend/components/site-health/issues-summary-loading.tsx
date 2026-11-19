import { Stack } from '@/components/ui/layout';
import { OpenRowSkeleton } from '@/components/ui/open-row-skeleton';
import { SectionHeaderSkeleton } from '@/components/ui/loading-parts';
import { Section } from '@/components/ui/section';
import { SkeletonFrame } from '@/components/ui/skeleton-block';
import { ToolbarTableLoading } from '@/components/ui/table-loading';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';

/**
 * The Issues summary's two sections at their loaded height (the severity ring
 * sets the first, three captioned rows the second), so the table below does
 * not move.
 */
export function IssuesSummaryLoading() {
  return (
    <SkeletonFrame label="Loading the issue summary" variant="summary">
      <Stack gap="workspace" className="min-w-0">
        <Section>
          <SectionHeaderSkeleton title="figure" ring />
        </Section>
        <Section>
          <SectionHeaderSkeleton title="heading" />
          <ol aria-hidden className={ledgerClasses()}>
            {[0, 1, 2].map((row) => (
              <li key={row} className={ledgerItemClasses()}>
                <OpenRowSkeleton />
              </li>
            ))}
          </ol>
        </Section>
      </Stack>
    </SkeletonFrame>
  );
}

/**
 * The Issues page before its first read: the summary, then the table under
 * its held toolbar (the Technical / Content / AEO switch's row over the search
 * row). Apart from the loaded page, so the route's loading frame draws it too.
 */
export function IssuesPageLoading() {
  return (
    <>
      <IssuesSummaryLoading />
      <ToolbarTableLoading label="Loading issues" columns={4} rows={8} view />
    </>
  );
}
