import { useQuery } from '@tanstack/react-query';
import { UrlDetail } from '@/components/site-health/url-detail';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { ProjectLink } from '@/components/ui/project-link';
import { readableUrl } from '@/lib/format';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { pageDisplayTitle } from '@/lib/site-health/status';

export function PageDrawer({
  workspaceId,
  crawlId,
  siteUrlId,
  onClose,
}: Readonly<{
  workspaceId: string;
  crawlId: string;
  siteUrlId: string | null;
  onClose: () => void;
}>) {
  const page = useQuery({
    ...siteHealthQueries.page(workspaceId, crawlId, siteUrlId ?? ''),
    enabled: siteUrlId !== null,
  });
  return (
    <Drawer
      open={siteUrlId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={page.data ? pageDisplayTitle(page.data.title, page.data.display_url) : 'Page'}
      description={page.data ? readableUrl(page.data.display_url) : undefined}
      actions={
        siteUrlId ? (
          <Button asChild variant="secondary">
            <ProjectLink href={`/site/crawls/${crawlId}/pages/${siteUrlId}`}>
              Open full page
            </ProjectLink>
          </Button>
        ) : null
      }
      width="rail"
      body="dock"
    >
      {siteUrlId ? (
        <UrlDetail
          key={`${crawlId}:${siteUrlId}`}
          crawlId={crawlId}
          siteUrlId={siteUrlId}
          frame="drawer"
        />
      ) : null}
    </Drawer>
  );
}
