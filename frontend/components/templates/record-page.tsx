import type { ReactNode } from 'react';

import { Columns, Stack } from '@/components/ui/layout';
import { PageSections } from '@/components/ui/page-chrome';
import { ActionBar, RecordBody } from '@/components/ui/record-chrome';

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
            <Columns template="record" gap="section" align="start">
              <PageSections>{children}</PageSections>
              <Stack as="aside" gap="section" className="min-w-0">
                {aside}
              </Stack>
            </Columns>
          ) : (
            children
          )}
        </PageSections>
      </RecordBody>
      {actionBar ? <ActionBar sticky>{actionBar}</ActionBar> : null}
    </PageFrame>
  );
}
