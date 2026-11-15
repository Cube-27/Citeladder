import { SearchX } from 'lucide-react';
import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { ShellFallback } from '@/components/layout/shell-fallback';
import { NoticePage, NoticeScreen } from '@/components/templates/notice-page';
import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';
import { isChunkLoadError, reportClientError } from '@/lib/client-errors';

/**
 * Report what the boundary caught once it shows: a route chunk that could not
 * download, an error response a loader threw, or `kind` for anything else.
 */
function useReportedRouteError(kind: 'render' | 'route') {
  const caught = useRouteError();
  useEffect(() => {
    let error = caught;
    if (isRouteErrorResponse(caught)) error = new Error(`${caught.status} ${caught.statusText}`);
    reportClientError({ kind: isChunkLoadError(error) ? 'chunk_load' : kind, error });
  }, [caught, kind]);
}

function OverviewLink({ variant }: Readonly<{ variant?: 'secondary' }>) {
  return (
    <Button asChild variant={variant ?? 'primary'}>
      <ProjectLink href="/projects">Go to Overview</ProjectLink>
    </Button>
  );
}

function ReloadButton() {
  return (
    <Button variant="primary" onClick={() => window.location.reload()}>
      Reload page
    </Button>
  );
}

/**
 * A screen that failed to render, shown inside the shell so navigation and
 * sign-out stay available. Reloading also recovers a route chunk replaced by a
 * deployment.
 */
export function ScreenError() {
  useReportedRouteError('render');
  return (
    <NoticePage
      title="Something went wrong"
      tone="negative"
      heading="This page could not be opened"
      actions={
        <>
          <ReloadButton />
          <OverviewLink variant="secondary" />
        </>
      }
    >
      Reload to try again, or go back to Overview.
    </NoticePage>
  );
}

/** An application URL that matches no screen. */
export function NotFoundScreen() {
  return (
    <NoticePage
      title="Page not found"
      tone="info"
      icon={SearchX}
      heading="There is no page at this address"
      actions={<OverviewLink />}
    >
      Check the link, or go back to Overview.
    </NoticePage>
  );
}

/** A fresh document also recovers route chunks replaced by a deployment. */
export function RouteError() {
  useReportedRouteError('route');
  return (
    <ShellFallback>
      <NoticeScreen
        tone="warning"
        heading="This page could not be opened"
        actions={<ReloadButton />}
      >
        Reload this page to try again.
      </NoticeScreen>
    </ShellFallback>
  );
}
