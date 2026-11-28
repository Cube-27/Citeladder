import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';
import { StateBlock } from '@/components/ui/state-block';
import { SearchX } from '@/lib/icons';
import { HOME_PATH, recoveryRoute } from '@/lib/navigation/app-routes';

import { PageFrame } from './page-frame';

export function NotFoundScreen() {
  const parent = recoveryRoute(useLocation().pathname ?? '');
  return (
    <PageFrame title="Page not found">
      <StateBlock
        kind="empty"
        icon={SearchX}
        heading="There is no page at this address"
        description="Check the link, or go back to a page that exists."
        action={
          <>
            <Button asChild variant="primary">
              <ProjectLink href={parent?.path ?? HOME_PATH}>
                {parent ? `Back to ${parent.title}` : 'Go to Overview'}
              </ProjectLink>
            </Button>
            {parent ? (
              <Button asChild variant="secondary">
                <ProjectLink href={HOME_PATH}>Go to Overview</ProjectLink>
              </Button>
            ) : null}
          </>
        }
      />
    </PageFrame>
  );
}
