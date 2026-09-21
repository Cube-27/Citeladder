'use client';

import { useContext, useLayoutEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { textRole } from '@/components/ui/typography';
import { pageToolbarClasses } from '@/components/ui/workspace';
import { cn } from '@/lib/utils';

import { CompactPageTitleContext } from './compact-page-title-context';
import { resolveTitle } from './page-titles';

/**
 * PageShell — the grammar every authenticated route is written in.
 *
 * Routes used to assemble their own top area, and no two agreed: five different
 * wrapper gaps, toolbars that were a bare `flex gap-2` on one screen and a
 * `<Card>` on another, tab strips at three heights, and nothing at all drawn
 * between a page's title and its work. The reader had to re-learn where a page
 * began on every navigation.
 *
 * So a page is now four regions in a fixed order, and only the first and last
 * are compulsory:
 *
 *   1. identity   — the route's one H1 and its actions.       (56px, ruled)
 *   2. navigation — the route's tabs, and nothing else.       (40px, ruled)
 *   3. controls   — filters, search, range, export.           (40px, ruled)
 *   4. content    — the work.
 *
 * Two invariants carry the consistency:
 *
 * Every band that is present closes with a hairline, and that hairline is
 * FULL-BLEED — it runs the whole width of the paper, not just the width of the
 * gutter. So the gutter lives inside each band rather than around all of them,
 * and content always begins directly below exactly one rule, at an offset the
 * reader has already seen on the previous screen. A route with no tabs and no
 * filters is not a different kind of page; it is this page with two rows
 * missing, and it still closes its identity band.
 *
 * And the bands are the only place these things may live. Tabs do not carry
 * actions (those are identity's), filters do not ride a section header, and a
 * toolbar is never boxed. That is what makes a screen's first read the same
 * everywhere: the answer to "where does this page start" is structural, not a
 * judgement each route makes for itself.
 */
export function PageShell({
  title,
  actions,
  tabs,
  controls,
  children,
  className,
}: Readonly<{
  /** Overrides the route-derived title (rare — prefer `page-titles.ts`). */
  title?: string;
  /** Route-owned controls; their state and outcomes stay with the route owner. */
  actions?: ReactNode;
  /** The route's tab strip. Pass `<Tabs variant="band">`. */
  tabs?: ReactNode;
  /** Filters, search, range and export for the whole route. */
  controls?: ReactNode;
  children?: ReactNode;
  className?: string;
}>) {
  return (
    <>
      <IdentityBand title={title} actions={actions} />
      {tabs ? <PageBand kind="navigation">{tabs}</PageBand> : null}
      {controls ? (
        <PageBand kind="control" className={pageToolbarClasses}>
          {controls}
        </PageBand>
      ) : null}
      <div className={cn(pageGutterClasses, 'pt-[var(--page-section-gap)]', className)}>
        {children}
      </div>
    </>
  );
}

/**
 * Content that belongs to the page but sits outside its `PageShell` — a route
 * appending something after the screen it renders. It only borrows the measure
 * and the gutter, so the thing stays aligned with the work above it.
 */
export function PageRegion({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={cn(pageGutterClasses, 'pt-[var(--page-section-gap)]', className)}>
      {children}
    </div>
  );
}

/**
 * The paper's measure. Bands and content share it so their gutters line up and
 * the rules stop at the same place the work does.
 */
const pageGutterClasses =
  'mx-auto w-full max-w-[var(--content-max-width)] px-[var(--content-gutter)]';

/**
 * One row of the grammar: a full-width rule with a gutter-padded row inside it.
 * The rule is on the outer element precisely so it is not inset — the reason
 * the whole shape reads as ruled paper rather than as a stack of loose boxes.
 *
 * `data-page-band` is the test surface: the design policy forbids tests
 * asserting visual classes, so the grammar is asserted through the attribute.
 */
function PageBand({
  kind,
  className,
  children,
}: Readonly<{
  kind: 'identity' | 'navigation' | 'control';
  className?: string;
  children: ReactNode;
}>) {
  return (
    <div
      data-page-band={kind}
      className={cn('border-border border-b', kind === 'control' && 'bg-panel-tonal')}
    >
      <div className={cn(pageGutterClasses, 'flex', className)}>{children}</div>
    </div>
  );
}

function IdentityBand({ title, actions }: Readonly<{ title?: string; actions?: ReactNode }>) {
  const pathname = useLocation().pathname ?? '';
  const resolved = title ?? resolveTitle(pathname);
  const setCompactTitle = useContext(CompactPageTitleContext);

  useLayoutEffect(() => {
    if (!setCompactTitle || title === undefined) return;
    setCompactTitle(title);
    return () => {
      setCompactTitle((current) => (current === title ? undefined : current));
    };
  }, [setCompactTitle, title]);

  return (
    <div
      data-page-band="identity"
      className={cn(
        'border-border border-b',
        // Below 701px the compact topbar already names the page, so a band
        // holding only a screen-reader title would be an empty ruled row.
        !actions && 'max-[700px]:hidden',
      )}
    >
      <div
        className={cn(
          pageGutterClasses,
          'flex min-w-0 flex-col gap-[var(--page-header-gap)] pt-[var(--page-header-padding-top)] pb-[var(--page-header-padding-bottom)]',
          'min-[701px]:flex-row min-[701px]:items-center min-[701px]:justify-between',
          // Desktop: the sidebar's switcher line. The title centres on it, and
          // the band below starts where the sidebar's second row starts.
          'min-[981px]:min-h-[var(--page-band-identity)] min-[981px]:py-0',
        )}
      >
        <div className="min-w-0 flex-1 max-[700px]:sr-only">
          {/* The route H1 sits at the object-title rung, not the 26px page-title
              rung. At 26px it was the largest thing on every screen and competed
              with the work below it for first read; the rail and the band's own
              rule already say where the reader is, so the heading labels the
              paper rather than announcing it. It stays the one H1 per route. */}
          <h1 className={textRole('objectTitle', 'min-w-0 [overflow-wrap:break-word]')}>
            {resolved}
          </h1>
        </div>
        {actions ? (
          // The shell paints the account glyph at the end of this same row, so
          // route actions reserve its width instead of running underneath it.
          // Desktop-only, because that is the only width the glyph appears at.
          <div className="flex min-h-[var(--control-height)] shrink-0 flex-wrap items-center gap-2 min-[981px]:pe-[calc(var(--control-height)+0.75rem)]">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
