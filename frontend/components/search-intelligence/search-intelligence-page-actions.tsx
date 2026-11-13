import { Button } from '@/components/ui/button';
import type { SearchIntelligenceDataset } from '@/lib/api/search-intelligence';
import type { SearchReviewAction } from '@citeladder/contracts/search-intelligence-requests';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import type { SearchCollection } from './search-intelligence-collection-state';
import { referringLists } from './search-intelligence-format';

/** A tab's next steps; each is omitted for a role that may not take it. */
export type CollectionActions = {
  /** Reviews a keyword to research, a run. */
  onSeed?: () => void;
  /** Saves citation matches, a write. */
  onMatch?: (targetOrigin: string | undefined) => void;
  /** Reviews a deeper collection, a run. */
  onExpand?: () => void;
};

/**
 * The page's actions, each only for a role that may take it: reviews and
 * cancels spend or stop credits (run); saving citation matches is a write.
 */
export function useRoleActions({
  openReview,
  cancel,
  openMatch,
}: Readonly<{
  openReview: (action: SearchReviewAction) => void;
  cancel: (runId: string) => void;
  openMatch: (targetOrigin: string | undefined) => void;
}>): Readonly<
  CollectionActions & {
    review?: (action: SearchReviewAction) => void;
    /** Opens the analysis review: the first run, or the recovery for a stopped one. */
    analysis?: () => void;
    cancel?: (runId: string) => void;
  }
> {
  const canRun = useWorkspaceCapability('run');
  const canWrite = useWorkspaceCapability('write');
  const onMatch = canWrite ? openMatch : undefined;
  if (!canRun) return { onMatch };
  return {
    review: openReview,
    analysis: () => openReview('analysis'),
    cancel,
    onSeed: () => openReview('seed'),
    onExpand: () => openReview('increase_depth'),
    onMatch,
  };
}

export function PageActions({
  hasDatasets,
  onReview,
  onCost,
}: Readonly<{
  hasDatasets: boolean;
  /** Opens a credit-spending review; omitted for a role that may not run one. */
  onReview?: (action: SearchReviewAction) => void;
  onCost: () => void;
}>) {
  const costDetails = (
    <Button variant="ghost" onClick={onCost}>
      Cost details
    </Button>
  );
  if (!onReview) return costDetails;
  return (
    <>
      {costDetails}
      {hasDatasets ? (
        <>
          <Button variant="secondary" onClick={() => onReview('refresh')}>
            Refresh
          </Button>
          <Button variant="primary" onClick={() => onReview('analysis')}>
            New analysis
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={() => onReview('analysis')}>
          Review first analysis
        </Button>
      )}
    </>
  );
}

/**
 * The tab's own next step, at the end of the control strip: its research
 * action, then a deeper review of the saved result on screen.
 */
export function CollectionAction({
  collection,
  datasets,
  onSeed,
  onMatch,
  onExpand,
}: Readonly<
  {
    collection: SearchCollection;
    datasets: SearchIntelligenceDataset[];
  } & CollectionActions
>) {
  // Only the website on screen: matching another website's list would save
  // matches for a site the reader is not looking at.
  const matchable =
    collection.tab === 'backlinks' &&
    referringLists(datasets).some((dataset) => dataset.target_origin === collection.target);
  const expandable = !collection.listingCompetitors && Boolean(collection.dataset);
  return (
    <>
      {collection.tab === 'keywords' && onSeed ? (
        <Button variant="secondary" onClick={onSeed}>
          Research a keyword
        </Button>
      ) : null}
      {matchable && onMatch ? (
        <Button variant="secondary" onClick={() => onMatch(collection.target)}>
          Match with Visibility citations
        </Button>
      ) : null}
      {expandable && onExpand ? (
        <Button variant="ghost" onClick={onExpand}>
          Review depth
        </Button>
      ) : null}
    </>
  );
}
