import { Drawer } from '@/components/ui/drawer';
import { SectionBleed } from '@/components/ui/section';
import { Stack } from '@/components/ui/layout';
import { PageLink } from '@/components/site-health/page-link';
import type { SiteArchitecture } from '@citeladder/contracts';
import { ClampText } from '@/components/ui/clamp-text';
import { UrlText } from '@/components/ui/table';
import { formatCount, pluralCount } from '@/lib/format';
import { type FigureSegment } from '@/components/ui/figure-strip';

const ORPHAN_SCOPE_NOTE = 'within this crawl';

export function orphanSegment({
  pages,
  total,
  onOpen,
}: Readonly<{
  pages: SiteArchitecture['internal_linking']['orphan_pages'];
  total: number | null;
  onOpen: () => void;
}>): FigureSegment {
  const base = { key: 'orphans', label: 'Orphaned pages' };
  if (total === null) return { ...base, value: null };
  if (pages.length === 0) return { ...base, value: total, sub: ORPHAN_SCOPE_NOTE };
  return {
    ...base,
    value: total,
    sub: ORPHAN_SCOPE_NOTE,
    onSelect: onOpen,
    actionLabel: `View ${pluralCount(total, 'orphaned page')}`,
  };
}

export function OrphanPageDrawer({
  pages,
  total,
  crawlId,
  open,
  onOpenChange,
}: Readonly<{
  pages: SiteArchitecture['internal_linking']['orphan_pages'];
  total: number | null;
  crawlId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const undisclosed = (total ?? pages.length) - pages.length;
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Orphaned pages"
      closeLabel="Close orphaned pages"
    >
      <>
        <SectionBleed as="ul" rows>
          {pages.map((page) => (
            <Stack as="li" gap="tight" key={page.site_url_id} className="min-w-0">
              {crawlId ? (
                <PageLink
                  text="body"
                  className="block min-w-0"
                  crawlId={crawlId}
                  siteUrlId={page.site_url_id}
                >
                  {page.title ? <ClampText>{page.title}</ClampText> : <UrlText url={page.url} />}
                </PageLink>
              ) : (
                <span className="text-body text-ink flex min-w-0">
                  {page.title ? <ClampText>{page.title}</ClampText> : <UrlText url={page.url} />}
                </span>
              )}
              <span className="text-caption text-ink-2 flex min-w-0">
                <UrlText url={page.url} />
              </span>
            </Stack>
          ))}
        </SectionBleed>
        {undisclosed > 0 ? (
          <p className="text-caption text-ink-2">and {formatCount(undisclosed)} more</p>
        ) : null}
      </>
    </Drawer>
  );
}
