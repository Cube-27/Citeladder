import type { FilterDefinition } from '@/components/ui/all-filters';
import { useFanoutGroupFilter } from '@/components/visibility/fanout-evidence';
import { sourceTableFilters } from '@/components/visibility/source-filters';
import type { SourceFilters } from '@/components/visibility/source-rows';
import { optionalStringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import type { VisibilityView } from '@/lib/visibility/dashboard';
import {
  useSourceDomains,
  useSourceTypes,
  type SourceQueries,
} from '@/lib/visibility/use-source-analysis';

/** A narrowing changes the rows, so the table's paging starts over. */
const PAGING = { clearKeys: ['source_cursor', 'source_offset', 'source_as_of'] };

/**
 * Which source table the tab shows, if any: the inventory, or a domain's URLs.
 * A URL's own page and a domain's Prompts view list no table.
 */
function useSourceTableScope(view: VisibilityView) {
  const [url] = useUrlState('source_url', optionalStringUrlCodec);
  const [domain] = useUrlState('source_domain', optionalStringUrlCodec);
  const [domainView] = useUrlState('source_view', optionalStringUrlCodec);
  const sourcesTab = view === 'domains' || view === 'urls' || view === 'read-not-cited';
  if (!sourcesTab || url) return null;
  if (domain)
    return domainView === 'prompts'
      ? null
      : { dimension: 'url' as const, domain, readNotCited: false };
  return {
    dimension: view === 'domains' ? ('domain' as const) : ('url' as const),
    domain: null,
    readNotCited: view === 'read-not-cited',
  };
}

/**
 * The filters of the table a Visibility tab shows (a Sources table's type,
 * standing and publisher; the Query fanouts grouping), for the page's one All
 * filters menu. They write the same URL state the table reads.
 */
export function useTableFilters({
  view,
  filters,
  queries,
}: Readonly<{
  view: VisibilityView;
  filters: SourceFilters;
  queries: SourceQueries;
}>): FilterDefinition[] {
  const groupFilter = useFanoutGroupFilter();
  const scope = useSourceTableScope(view);
  const [sourceType, setSourceType] = useUrlState('source_type', optionalStringUrlCodec, PAGING);
  const [standing, setStanding] = useUrlState('source_standing', optionalStringUrlCodec, PAGING);
  const [picked, setPicked] = useUrlState('source_pick', optionalStringUrlCodec, PAGING);
  const dimension = scope?.dimension ?? 'domain';
  // Only the URL inventory offers the publisher filter.
  const domainOptions = useSourceDomains(filters, queries, dimension === 'url' && !scope?.domain);
  const activeDomain = scope?.domain ?? (dimension === 'url' ? picked : null);
  const types = useSourceTypes(filters, queries, {
    dimension,
    domain: activeDomain,
    enabled: scope !== null,
  });
  if (view === 'query-fanout') return [groupFilter];
  if (!scope) return [];
  return sourceTableFilters({
    dimension,
    type: { value: sourceType, options: types, onChange: setSourceType },
    standing: scope.readNotCited ? null : { gapOnly: standing === 'gap', onChange: setStanding },
    domain: scope.domain ? null : { value: picked, options: domainOptions, onChange: setPicked },
  });
}
