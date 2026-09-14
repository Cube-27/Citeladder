'use client';

import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { SearchField } from '@/components/ui/search-field';
import {
  parseCursor,
  parseIssueFilters,
  serializeIssueFilters,
  type IssueFilters,
} from '@/lib/site-health/filters';

export function useIssuesCatalogUrlState() {
  const router = useNavigate();
  const pathname = useLocation().pathname;
  const searchParams = useSearchParams()[0];
  const searchParamString = searchParams.toString();
  const urlParams = useMemo(() => new URLSearchParams(searchParamString), [searchParamString]);
  const filters = useMemo(() => parseIssueFilters(urlParams), [urlParams]);
  const cursor = useMemo(() => parseCursor(urlParams), [urlParams]);
  const selectedGroupId = urlParams.get('issue');

  const navigate = (nextFilters: IssueFilters, nextCursor: string | null) => {
    const nextParams = serializeIssueFilters(nextFilters, nextCursor, urlParams);
    nextParams.delete('issue');
    const nextQuery = nextParams.toString();
    const href = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const currentHref = searchParamString ? `${pathname}?${searchParamString}` : pathname;
    if (href !== currentHref) router(href, { preventScrollReset: true });
  };

  const selectIssue = (groupId: string) => {
    const nextParams = new URLSearchParams(urlParams);
    nextParams.set('issue', groupId);
    router(`${pathname}?${nextParams.toString()}`, { preventScrollReset: true });
  };

  return { cursor, filters, selectedGroupId, navigate, selectIssue };
}

export function IssueSearch({
  query,
  onApply,
}: Readonly<{ query: string; onApply: (query: string) => void }>) {
  const [draft, setDraft] = useState(query);
  return (
    <form
      className="min-w-0 max-[700px]:w-full"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      <SearchField
        value={draft}
        onValueChange={setDraft}
        placeholder="Search issues…"
        aria-label="Search issues"
        className="w-full max-w-xs max-[700px]:max-w-none"
      />
    </form>
  );
}
