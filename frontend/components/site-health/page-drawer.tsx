import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  linkedPage,
  PageOpenContext,
  type PageTarget,
} from '@/components/site-health/page-open-context';
import { UrlDetail } from '@/components/site-health/url-detail';
import { Drawer } from '@/components/ui/drawer';
import { UrlText } from '@/components/ui/table';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { pageDisplayTitle } from '@/lib/site-health/status';

export function PageDrawerHost({
  workspaceId,
  linked = null,
  onClosed,
  children,
}: Readonly<{
  workspaceId: string;
  linked?: string | null;
  onClosed?: () => void;
  children?: ReactNode;
}>) {
  const [target, setTarget] = useState<PageTarget | null>(() => linkedPage(linked));
  const [seen, setSeen] = useState(linked);
  if (linked !== seen) {
    setSeen(linked);
    setTarget(linkedPage(linked));
  }
  const page = useQuery({
    ...siteHealthQueries.page(workspaceId, target?.crawlId ?? '', target?.siteUrlId ?? ''),
    enabled: target !== null,
  });
  return (
    <PageOpenContext value={setTarget}>
      {children}
      <Drawer
        open={target !== null}
        onOpenChange={(open) => {
          if (open) return;
          setTarget(null);
          onClosed?.();
        }}
        title={page.data ? pageDisplayTitle(page.data.title, page.data.display_url) : 'Page'}
        description={page.data ? <UrlText url={page.data.display_url} /> : undefined}
        width="rail"
        body="dock"
      >
        {target ? (
          <UrlDetail
            key={`${target.crawlId}:${target.siteUrlId}`}
            crawlId={target.crawlId}
            siteUrlId={target.siteUrlId}
            polling={target.rerun === true}
          />
        ) : null}
      </Drawer>
    </PageOpenContext>
  );
}
