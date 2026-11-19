import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';

import { buttonClasses } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { RowActions } from '@/components/ui/masthead-actions';
import { ProjectLink } from '@/components/ui/project-link';
import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The masthead's rule and fill: a layer behind it as wide as the main column
 * (its size container plus both gutters), on the page's own surface, so
 * content scrolling under it never shows beside it and its hairline meets the
 * sidebar's ident cell. Centred on the masthead, so a narrow page's masthead
 * still draws it column-wide.
 */
const BAR_LAYER =
  'before:bg-ground before:border-rule before:absolute before:inset-y-0 before:inset-x-[calc(50%_-_50cqw_-_var(--content-gutter))] before:-z-10 before:border-b';

/** A masthead control that keeps its text label wherever it is drawn (search, "Ask agent"). */
export const MASTHEAD_LABELLED = 'shrink-0 justify-start';

/**
 * Masthead: the head of every shell page, 56 tall on `chrome`, sticky with a
 * rule under it, one row at every width, across the whole main column. From
 * the left, at the page's own start (`--page-start`, so a narrow page's title
 * lines up with its content): the menu button below 900px and a record
 * page's back link (`lead`), the page title in `title` type; at the column's
 * right edge on every page the search trigger, then "Ask agent" (`end`), each
 * with its text label. A page's own actions sit in its strips (`PageFrame`,
 * owner 2026-11-19), never here.
 *
 * The title is one line: a longer name is cut with an ellipsis, and only then
 * does it take keyboard focus and show the full name in the tooltip. Its
 * accessible name is always the full name. Below `rail` the search and "Ask
 * agent" fold into one "More" menu. A button label is never cut: a row that
 * would squeeze the title under min(360px, 40% of the masthead) (or its whole
 * text, if shorter) folds them into More.
 */
export function Masthead({
  title,
  lead,
  search,
  end,
  crumb,
}: Readonly<{
  title: string;
  /** Before the title: the menu button, a record's back link. */
  lead?: ReactNode;
  /** A trail of where the page sits, drawn instead of the title; the page then carries its own h1. */
  crumb?: ReactNode;
  /** The shell's search trigger, first at the right. */
  search?: ReactNode;
  /** Last at the right: "Ask agent", or the Agent's History button. */
  end?: ReactNode;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  const header = useRef<HTMLElement>(null);
  const cut = useIsCut(heading, title);
  usePublishedHeight(header);
  const hasControls = [search, end].some(
    (part) => part !== undefined && part !== null && part !== false,
  );
  return (
    <header
      data-masthead=""
      ref={header}
      className={cn(
        BAR_LAYER,
        // As wide as the main column, past the page's 1440 cap, so search and "Ask agent" end on its edge.
        'z-sticky sticky top-0 isolate flex min-h-[var(--masthead-height)] w-[100cqw] min-w-0 items-center gap-2 ps-[var(--page-start,0px)] rail:h-[var(--masthead-height)]',
      )}
    >
      {/* Below `rail` the title side keeps its content's minimum; the actions give way. */}
      <div data-masthead-title="" className="rail:min-w-0 me-2 flex flex-1 items-center gap-2">
        {lead}
        {crumb ?? (
          <Tooltip content={title} side="bottom" describe={false} shouldOpen={isTextCut}>
            <h1
              ref={heading}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Only a cut title takes focus, so a keyboard reader can open the tooltip holding the full name.
              tabIndex={cut ? 0 : undefined}
              className={textRole(
                'title',
                // One line at every width, never under 112px; the fold keeps it min(360px, 40%) (`rowDeficit`).
                cn('not-rail:w-0 not-rail:flex-1 min-w-28 truncate', cut && 'focus-ring'),
              )}
            >
              {title}
            </h1>
          </Tooltip>
        )}
      </div>
      {hasControls ? (
        <RowActions>
          {search}
          {end ? <div className="flex flex-col">{end}</div> : null}
        </RowActions>
      ) : null}
    </header>
  );
}

/**
 * A record page's way back to its collection, before the title: the quiet
 * arrow link, named for where it goes ("Back to runs"), scoped to the active
 * project (or `projectId`) like any app link.
 */
export function MastheadBack({
  href,
  label,
  projectId,
}: Readonly<{ href: string; label: string; projectId?: string | null }>) {
  return (
    <Tooltip content={label} describe={false}>
      <ProjectLink
        href={href}
        projectId={projectId}
        aria-label={label}
        className={cn(buttonClasses('quiet'), 'w-[var(--control-md)] shrink-0 gap-0 px-0')}
      >
        <Icon icon={ArrowLeft} />
      </ProjectLink>
    </Tooltip>
  );
}

/**
 * Publishes the masthead's drawn height on the document as
 * `--masthead-block-size`, so a screen that fills the viewport and the scroll
 * padding allow for its second row below `rail`.
 */
function usePublishedHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty('--masthead-block-size', `${node.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--masthead-block-size');
    };
  }, [ref]);
}

/**
 * Whether the element is cutting its text, kept current as it resizes, so a
 * cut title (and only a cut one) can take focus to reveal its tooltip.
 */
function useIsCut(ref: RefObject<HTMLElement | null>, text: string) {
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setCut(isTextCut(node));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, text]);
  return cut;
}
