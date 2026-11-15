import type { ReactNode } from 'react';

import { Inline, Stack } from './layout';
import { Tag as DraftTag } from './tag';
import { textRole } from './typography';
import { cn } from '@/lib/utils';

/**
 * Where a draft stands. `draft`: proposed and not yet decided (dashed edge).
 * `accepted`: a person took it (the dashed edge sets solid over 200ms: the ink
 * sets). `declined`: a person turned it down (no edge: it no longer applies).
 */
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

/** The draft face alone, for a container that lays out its own content. */
function draftSheetClasses(state: DraftState, className?: string) {
  return cn(
    'rounded-card p-[var(--card-padding)]',
    state === 'declined' ? 'bg-well' : 'bg-surface shadow-card edge-draft',
    className,
  );
}

/**
 * DraftSheet: a card for something written for a person to decide on (a
 * proposal, a suggestion, a candidate): a dashed `control-line` edge, a static
 * "Draft" tag, its sans content, then its decision actions. When a person
 * accepts it the edge sets solid over 200ms; the actions stay so the sheet
 * keeps its size.
 */
export function DraftSheet({
  title,
  state,
  marker,
  actions,
  as: Tag = 'section',
  id,
  className,
  children,
  ...aria
}: Readonly<{
  /** Names the sheet; drawn as its heading unless `as` is a list item with its own text. */
  title?: string;
  state: DraftState;
  /** Overrides the state's word ("Draft", "Accepted", "Dismissed"). */
  marker?: string;
  actions?: ReactNode;
  as?: 'section' | 'li' | 'div';
  id?: string;
  className?: string;
  children?: ReactNode;
  'aria-current'?: boolean;
}>) {
  return (
    <Tag
      id={id}
      aria-label={Tag === 'section' ? title : undefined}
      aria-current={aria['aria-current']}
      data-draft={draftAttribute(state)}
      data-draft-state={state}
      className={draftSheetClasses(state, className)}
    >
      <Stack gap="item">
        <p className="flex">
          <DraftTag>{marker ?? MARKER[state]}</DraftTag>
        </p>
        {title ? <h3 className={textRole('subheading', 'min-w-0 break-words')}>{title}</h3> : null}
        {children}
        {actions ? <Inline className="flex-wrap">{actions}</Inline> : null}
      </Stack>
    </Tag>
  );
}
