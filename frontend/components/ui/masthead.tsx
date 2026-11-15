import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';

import { buttonClasses } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MastheadOverflow, MastheadPrimarySlot } from '@/components/ui/masthead-actions';
import { ProjectLink } from '@/components/ui/project-link';
import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The masthead's rule and fill: a layer behind it as wide as the main column
 * (its size container plus both gutters), so content scrolling under it never
 * shows beside it and its hairline meets the sidebar's ident cell.
 */
const BAR_LAYER =
  'before:bg-ground before:border-rule before:absolute before:inset-y-0 before:-start-[var(--content-gutter)] before:-z-10 before:w-[calc(100cqw+2*var(--content-gutter))] before:border-b';

/**
 * Masthead: the head of every shell page, 48 tall and
 * sticky with a hairline under it. From the left: the menu button below
 * 900px and a record page's back link (`lead`), the page title in `title`
 * type; at the right the search trigger, the page's secondary actions and its
 * one primary action (`actions`, the primary inside `MastheadPrimary`), then
 * "Ask agent" (`end`). Controls are 32 and share the row.
 *
 * From `rail` the masthead is one 48px row and the title one line: a longer
 * name is cut with an ellipsis, and only then does it take keyboard focus and
 * show the full name in the tooltip. Its accessible name is always the full
 * name. Below `rail` a page with actions takes a second row for them, ending on
 * the edge: More actions (the secondary actions, folded), the primary, "Ask
 * agent"; the title then wraps to two lines before it is cut.
 */
export function Masthead({
  title,
  lead,
  search,
  actions,
  end,
}: Readonly<{
  title: string;
  /** Before the title: the menu button, a record's back link. */
  lead?: ReactNode;
  /** The shell's search trigger, first at the right. */
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
  const hasActions = actions !== undefined && actions !== null && actions !== false;
  return (
    <header
      data-masthead=""
      ref={header}
      className={cn(
        BAR_LAYER,
        'z-sticky sticky top-0 isolate flex min-h-[var(--masthead-height)] min-w-0 items-center gap-2 rail:h-[var(--masthead-height)]',
      )}
    >
      <div className="me-2 flex min-h-[var(--masthead-height)] min-w-0 flex-1 items-center gap-2">
        {lead}
        <Tooltip content={title} side="bottom" describe={false} shouldOpen={isTextCut}>
          <h1
            ref={heading}
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Only a cut title takes focus, so a keyboard reader can open the tooltip holding the full name.
            tabIndex={cut ? 0 : undefined}
            className={textRole(
              'title',
              cn('min-w-0 break-words not-rail:line-clamp-2 rail:truncate', cut && 'focus-ring'),
            )}
          >
            {title}
          </h1>
        </Tooltip>
      </div>
      {search}
      <div data-masthead-end="" className="flex shrink-0 items-center gap-2">
        {hasActions ? (
          <MastheadPrimarySlot value={primarySlot}>
            <MastheadOverflow>{actions}</MastheadOverflow>
          </MastheadPrimarySlot>
        ) : null}
        <span ref={setPrimarySlot} data-masthead-primary="" className="contents" />
        {end}
      </div>
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
