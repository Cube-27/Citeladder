import type { ReactNode, RefCallback } from 'react';

import { Inline, Stack } from './layout';
import { SurfaceContext, useOnPage } from './section';
import { Tag as DraftTag } from './tag';
import { textRole } from './typography';
import { cn } from '@/lib/utils';

export type DraftState = 'draft' | 'accepted' | 'declined';

const MARKER: Readonly<Record<DraftState, string>> = {
  draft: 'Draft',
  accepted: 'Accepted',
  declined: 'Dismissed',
};

function draftAttribute(state: DraftState) {
  switch (state) {
    case 'draft':
      return 'true';
    case 'accepted':
      return 'false';
    case 'declined':
      return undefined;
    default: {
      const unknown: never = state;
      return unknown;
    }
  }
}

function draftSheetClasses(state: DraftState, onPage: boolean) {
  if (!onPage) return 'min-w-0';
  return cn(
    'bg-panel shadow-card rounded-card min-w-0 p-[var(--panel-inset)] [--panel-inset:var(--card-padding)]',
    state !== 'declined' && 'edge-draft',
  );
}

export function DraftSheet({
  title,
  state,
  marker,
  actions,
  as: Tag = 'section',
  id,
  ref,
  tabIndex,
  children,
  ...aria
}: Readonly<{
  title?: string;
  state: DraftState;
  marker?: string;
  actions?: ReactNode;
  as?: 'section' | 'li' | 'div';
  id?: string;
  ref?: RefCallback<HTMLElement>;
  tabIndex?: -1;
  children?: ReactNode;
  'aria-current'?: boolean;
}>) {
  const onPage = useOnPage();
  return (
    <Tag
      id={id}
      ref={ref}
      tabIndex={tabIndex}
      aria-label={Tag === 'section' ? title : undefined}
      aria-current={aria['aria-current']}
      data-draft={draftAttribute(state)}
      data-draft-state={state}
      className={draftSheetClasses(state, onPage)}
    >
      <SurfaceContext value="surface">
        <Stack gap="item">
          <p className="flex">
            <DraftTag kind={state === 'draft' ? 'draft' : 'category'}>
              {marker ?? MARKER[state]}
            </DraftTag>
          </p>
          {title ? (
            <h2 className={textRole('subheading', 'min-w-0 break-words')}>{title}</h2>
          ) : null}
          {children}
          {actions ? <Inline className="flex-wrap">{actions}</Inline> : null}
        </Stack>
      </SurfaceContext>
    </Tag>
  );
}
