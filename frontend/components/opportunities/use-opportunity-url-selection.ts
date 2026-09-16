'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { z } from 'zod';

import {
  optionalStringUrlCodec,
  setUrlParams,
  useUrlState,
  type UrlCodec,
} from '@/lib/navigation/url-state';

const uuidSchema = z.uuid();
const selectedCodec: UrlCodec<string | null> = {
  parse: (raw) => (raw && uuidSchema.safeParse(raw).success ? raw : null),
  serialize: (value) => value,
};

/**
 * Is the address still the one this hook renders for?
 *
 * React Router moves the location before the old route unmounts, so an effect
 * queued on the way out runs against the destination's address. Every write
 * below is a normalization of the Opportunities screen's own URL, and none of
 * them has any business editing another screen's.
 */
function ownsAddress(pathname: string): boolean {
  return typeof window === 'undefined' || window.location.pathname === pathname;
}

export function clearOpportunitySelection() {
  setUrlParams({ selected: null, opportunity: null, opportunity_id: null }, 'replace');
}

/** Canonical Opportunity detail URL state, including legacy inbound aliases. */
export function useOpportunityUrlSelection(scopeKey: string) {
  // The route this hook speaks for. Its writes normalize THIS screen's address,
  // and a navigation away can outlive them: the effects below still run while
  // the address already belongs to the destination, and `opportunity_id` is a
  // parameter the Content screen reads. Stripping it there deleted the handoff
  // the reader had just followed.
  const ownPathname = useLocation().pathname;
  const [selectedId, setSelectedId] = useUrlState('selected', selectedCodec);
  const [legacyOpportunity] = useUrlState('opportunity', optionalStringUrlCodec);
  const [legacyOpportunityId] = useUrlState('opportunity_id', optionalStringUrlCodec);
  const legacySelection =
    selectedCodec.parse(legacyOpportunity) ?? selectedCodec.parse(legacyOpportunityId);
  const inboundSelection = selectedId ?? legacySelection;
  const [selectionScope, setSelectionScope] = useState({
    scopeKey,
    selection: inboundSelection,
  });
  const selectionCarried =
    selectionScope.scopeKey !== scopeKey &&
    inboundSelection !== null &&
    inboundSelection === selectionScope.selection;

  useEffect(() => {
    if (!ownsAddress(ownPathname)) return;
    if (selectedId && (legacyOpportunity !== null || legacyOpportunityId !== null)) {
      setUrlParams({ opportunity: null, opportunity_id: null }, 'replace');
    } else if (legacySelection) {
      setUrlParams(
        { selected: legacySelection, opportunity: null, opportunity_id: null },
        'replace',
      );
    }
  }, [legacyOpportunity, legacyOpportunityId, legacySelection, ownPathname, selectedId]);

  useLayoutEffect(() => {
    if (selectionScope.scopeKey === scopeKey && selectionScope.selection === inboundSelection)
      return;
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- synchronize URL selection ownership before paint.
    setSelectionScope({ scopeKey, selection: inboundSelection });
    if (selectionCarried && ownsAddress(ownPathname)) clearOpportunitySelection();
  }, [inboundSelection, ownPathname, scopeKey, selectionCarried, selectionScope]);

  return {
    selectedId,
    visibleSelectedId: selectionCarried ? null : selectedId,
    setSelectedId,
  };
}
