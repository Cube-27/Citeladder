import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { PageFrame, type PageFrameSlots } from './page-frame';

/**
 * The Settings layout (docs/design.md): the page header, then the route's
 * column holding a stack of `SettingsGroup`s 32 apart, each section stacking
 * its own the same way (globals.css, `data-settings-sections`). With `rail`
 * (a `TabRail`) the sections run down a sticky 192 column on the left and the
 * current one's content sits beside it, at most 720 wide unless `wide`; the
 * header and rail never move between sections.
 */
export function SettingsPage({
  children,
  rail,
  wide = false,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'trail' | 'crumb' | 'tabs'> &
  Readonly<{
    rail?: ReactNode;
    /** This section's content takes the column's full width beside the rail. */
    wide?: boolean;
    children: ReactNode;
  }>) {
  const sections = (
    <div data-settings-sections="" className="min-w-0">
      {children}
    </div>
  );
  return (
    <PageFrame {...slots}>
      {rail ? (
        <RailColumns rail={rail} wide={wide}>
          {sections}
        </RailColumns>
      ) : (
        sections
      )}
    </PageFrame>
  );
}

/** The rail and the content beside it; a page's loading frame draws the same. */
export function RailColumns({
  rail,
  wide = false,
  children,
}: Readonly<{ rail: ReactNode; wide?: boolean; children: ReactNode }>) {
  return (
    <div className="desktop:flex-row flex min-w-0 flex-col gap-[var(--page-top-gap)]">
      <div className="desktop:sticky desktop:top-[calc(var(--masthead-block-size,var(--masthead-height))+var(--page-pad-block))] desktop:w-48 desktop:self-start shrink-0">
        {rail}
      </div>
      <div className={cn('min-w-0 flex-1', !wide && 'max-w-[var(--container-prose)]')}>
        {children}
      </div>
    </div>
  );
}
