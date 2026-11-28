import type { ReactNode } from 'react';

import { AppGrid } from '@/components/ui/app-grid';
import { Stack } from '@/components/ui/layout';
import { PageSections } from '@/components/ui/page-chrome';
import { RecordBody } from '@/components/ui/record-chrome';
import { FloatingBar } from '@/components/ui/selection-dock';

import { PageFrame, type PageFrameSlots } from './page-frame';

export function RecordPage({
  busy,
  identity,
  aside,
  actionBar,
  children,
  ...slots
}: PageFrameSlots &
  Readonly<{
    busy?: boolean;
    identity?: ReactNode;
    aside?: ReactNode;
    actionBar?: ReactNode;
    children: ReactNode;
  }>) {
  return (
    <PageFrame {...slots}>
      <RecordBody busy={busy} clearsBar={Boolean(actionBar)}>
        <PageSections>
          {identity}
          {aside ? (
            <AppGrid layout="main-aside">
              <PageSections>{children}</PageSections>
              <Stack as="aside" gap="section" box="shrink">
                {aside}
              </Stack>
            </AppGrid>
          ) : (
            children
          )}
        </PageSections>
      </RecordBody>
      {actionBar ? (
        <FloatingBar place="sticky" data-page-band="action-bar">
          {actionBar}
        </FloatingBar>
      ) : null}
    </PageFrame>
  );
}
