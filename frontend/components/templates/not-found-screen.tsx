import { SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';

import { NoticePage } from './notice-page';

/**
 * The shell's not-found state: an application URL that matches no screen, or
 * a record the API answers 404 for (deleted, or another workspace's).
 */
export function NotFoundScreen() {
  return (
    <NoticePage
      tone="info"
      icon={SearchX}
      label={null}
      heading="Page not found"
      actions={
        <Button asChild variant="primary">
          <ProjectLink href="/projects">Go to Overview</ProjectLink>
        </Button>
      }
    >
      There is no page at this address. Check the link, or go back to Overview.
    </NoticePage>
  );
}
