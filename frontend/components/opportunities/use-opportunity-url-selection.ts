'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
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

export function clearOpportunitySelection() {
  setUrlParams({ selected: null, opportunity: null, opportunity_id: null }, 'replace');
}

/** Canonical Opportunity detail URL state, including legacy inbound aliases. */
export function useOpportunityUrlSelection(scopeKey: string) {
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
    if (selectedId && (legacyOpportunity !== null || legacyOpportunityId !== null)) {
      setUrlParams({ opportunity: null, opportunity_id: null }, 'replace');
    } else if (legacySelection) {
      setUrlParams(
        { selected: legacySelection, opportunity: null, opportunity_id: null },
        'replace',
      );
    }
  }, [legacyOpportunity, legacyOpportunityId, legacySelection, selectedId]);

  useLayoutEffect(() => {
    if (selectionScope.scopeKey === scopeKey && selectionScope.selection === inboundSelection)
      return;
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- synchronize URL selection ownership before paint.
    setSelectionScope({ scopeKey, selection: inboundSelection });
    if (selectionCarried) clearOpportunitySelection();
  }, [inboundSelection, scopeKey, selectionCarried, selectionScope]);

  return {
    selectedId,
    visibleSelectedId: selectionCarried ? null : selectedId,
    setSelectedId,
  };
}
