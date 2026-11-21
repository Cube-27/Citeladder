import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { MastheadOverflow, MastheadPrimarySlot } from '@/components/ui/masthead-actions';
import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { ChevronRight, type IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

/** A masthead control that keeps its text label wherever it is drawn (search, "Ask agent"). */
export const MASTHEAD_LABELLED = 'shrink-0 justify-start';

/**
 * Masthead: the page header of every shell page, 44 tall on the panel, sticky
 * with a `rule` under it across the whole panel. From the left, at the page's
 * own start (`--page-start`, so a narrow page's title lines up with its
 * body): the menu button below 900px (`lead`), the section's icon and name,
 * then the page title (or a record page's trail, `crumb`), in `label` type;
 * at the right the page's secondary actions, its one primary action
 * (`actions`, the primary inside `MastheadPrimary`), then the search trigger
 * and "Ask agent" (`end`) on the panel's right edge on every page.
 *
 * The title is one line: a longer name is cut with an ellipsis, and only then
 * does it take keyboard focus and show the full name in the tooltip. Its
 * accessible name is always the full name. Below `rail` the row is the menu
 * button, the title, the primary and one "More" menu holding the search, the
 * secondary actions and "Ask agent". A button label is never cut: a row that
 * would squeeze the title under min(360px, 40% of the masthead) (or its whole
 * text, if shorter) folds its actions into More, the primary last.
 */
export function Masthead({
  title,
  section,
  lead,
  search,
  actions,
  end,
  crumb,
}: Readonly<{
  title: string;
  /** The nav group the page sits in, drawn before the title from `rail`. */
  section?: Readonly<{ title: string; icon: IconGlyph }> | null;
  /** Before the title: the menu button. */
  lead?: ReactNode;
  /** A trail of where the page sits, drawn instead of the title; the page then carries its own h1. */
  crumb?: ReactNode;
  /** The shell's search trigger, after the page's actions. */
  search?: ReactNode;
  /** The page's own actions: secondary first, then at most one primary. */
  actions?: ReactNode;
  /** Last at the right: "Ask agent", or the Agent's History button. */
  end?: ReactNode;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  const header = useRef<HTMLElement>(null);
  const cut = useIsCut(heading, title);
  usePublishedHeight(header);
  const [primarySlot, setPrimarySlot] = useState<HTMLElement | null>(null);
  const hasControls = [search, actions, end].some(
    (part) => part !== undefined && part !== null && part !== false,
  );
  return (
    <header
      data-masthead=""
      ref={header}
      // Across the panel's gutters, so its rule spans the panel and "Ask agent" ends on its edge.
      className="bg-panel border-rule z-sticky rail:h-[var(--masthead-height)] sticky top-0 -mx-[var(--page-pad-inline)] flex min-h-[var(--masthead-height)] min-w-0 items-center gap-2 border-b ps-[calc(var(--page-pad-inline)+var(--page-start,0px))] pe-[var(--page-pad-inline)]"
    >
      {/* Below `rail` the title side keeps its content's minimum; the actions give way. */}
      <div data-masthead-title="" className="rail:min-w-0 me-2 flex flex-1 items-center gap-2">
        {lead}
        {section ? (
          <span
            className={textRole('body', 'text-ink-2 rail:flex hidden shrink-0 items-center gap-2')}
          >
            <section.icon aria-hidden className="size-4" />
            {section.title}
            <ChevronRight aria-hidden className="size-3" />
          </span>
        ) : null}
        {crumb ?? (
          <Tooltip content={title} side="bottom" describe={false} shouldOpen={isTextCut}>
            <h1
              ref={heading}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Only a cut title takes focus, so a keyboard reader can open the tooltip holding the full name.
              tabIndex={cut ? 0 : undefined}
              className={textRole(
                'label',
                // One line ending in an ellipsis at every width, never under 112px; the fold keeps it min(360px, 40%) (`rowDeficit`).
                cn('w-0 min-w-28 flex-1 truncate', cut && 'focus-ring'),
              )}
            >
              {title}
            </h1>
          </Tooltip>
        )}
      </div>
      <div
        data-masthead-end=""
        className="flex shrink-0 items-center gap-2 [&_:is(button,a)]:shrink-0"
      >
        {hasControls ? (
          <MastheadPrimarySlot value={primarySlot}>
            <MastheadOverflow>
              {actions}
              {/* Search and "Ask agent" come after the primary, pinned at the right. */}
              {search ? <div className="rail:order-1 flex flex-col">{search}</div> : null}
              {end ? <div className="rail:order-1 flex flex-col">{end}</div> : null}
            </MastheadOverflow>
          </MastheadPrimarySlot>
        ) : null}
        <span ref={setPrimarySlot} data-masthead-primary="" className="contents" />
      </div>
    </header>
  );
}

/**
 * Publishes a sticky bar's drawn height on the document (the masthead's as
 * `--masthead-block-size`, the page strips' as `--strips-block-size`), so a
 * screen that fills the viewport, the scroll padding and what sticks below
 * allow for it, its second row below `rail` included.
 */
export function usePublishedHeight(
  ref: RefObject<HTMLElement | null>,
  property = '--masthead-block-size',
) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty(property, `${node.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty(property);
    };
  }, [ref, property]);
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
    // The title's box no longer resizes with its text, so a face that loads late is re-measured here.
    void document.fonts?.ready.then(update);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, text]);
  return cut;
}
