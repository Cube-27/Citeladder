import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

import { focusFromKeyboard } from '@/components/ui/input-modality';
import { POP_FACE } from '@/components/ui/slip';
import { cn } from '@/lib/utils';

/**
 * Tooltip — a short label that names an icon button or explains a number, on
 * a sheet (`raised`, hairline edge, the one shadow), `caption` type, 4/8px
 * padding, 8px from its anchor, no arrow. It fades in with a 2px rise
 * (ui-motion.css), after 300ms on hover and at once on keyboard focus; a shortcut prints as mono `on-ink` text, never a Kbd cap.
 * Only keyboard focus opens it: the focus a browser restores when the reader
 * returns to the tab, or one a script moves after a press, does not.
 *
 * Every open goes through Radix's pointer and focus handling, which closes any
 * other open tooltip first, so only one is ever open. A tooltip outside any
 * provider brings a provider of its own; the one-open rule still holds.
 */
const Provided = createContext(false);

/**
 * The tooltip's sheet: the pop face (`raised`, 1px `rule`, radius 8,
 * `shadow-pop`), a block at most 288px wide. Help hints share it. A tooltip
 * shows the full value, so it is the one place a URL may break anywhere.
 */
export const TOOLTIP_SHEET = cn(
  POP_FACE,
  'tooltip-panel z-modal type-caption block max-w-72 min-w-0 px-2 py-1 [overflow-wrap:anywhere]',
);

/** True when a clamped or truncated element is not showing all of its text. */
export function isTextCut(node: Element): boolean {
  return node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
}

export function TooltipProvider(props: Readonly<ComponentProps<typeof TooltipPrimitive.Provider>>) {
  return (
    <Provided.Provider value={true}>
      <TooltipPrimitive.Provider delayDuration={300} {...props} />
    </Provided.Provider>
  );
}

export function Tooltip({
  children,
  content,
  side = 'top',
  shortcut,
  describe = true,
  shouldOpen,
}: Readonly<{
  /** The described element, the only child. */
  children: ReactNode;
  /** A phrase, no full stop. */
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  shortcut?: string;
  /**
   * `false` where the trigger's accessible name already is this text (an
   * IconButton), so assistive technology does not hear it twice.
   */
  describe?: boolean;
  /**
   * Asked each time the tooltip is about to open, with its trigger; returning
   * false keeps it closed (e.g. text that turned out not to be cut).
   */
  shouldOpen?: (trigger: HTMLElement) => boolean;
}>) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  // Stable, so Radix's composed trigger ref is not detached on every render.
  const setTrigger = useCallback((node: HTMLElement | null) => {
    trigger.current = node;
  }, []);
  const onOpenChange = (next: boolean) => {
    if (!next || shouldOpen === undefined) {
      setOpen(next);
      return;
    }
    setOpen(trigger.current !== null && shouldOpen(trigger.current));
  };
  const provided = useContext(Provided);
  const tooltip = (
    <TooltipPrimitive.Root delayDuration={300} open={open} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger
        asChild
        ref={setTrigger}
        // A handled focus skips Radix's own, which opens on any focus.
        onFocus={(event) => {
          if (!focusFromKeyboard()) event.preventDefault();
        }}
        {...(describe ? {} : { 'aria-describedby': undefined })}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          avoidCollisions
          collisionPadding={8}
          className={TOOLTIP_SHEET}
        >
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1">{content}</span>
            {shortcut ? <span className="type-code text-ink-2 shrink-0">{shortcut}</span> : null}
          </span>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  return provided ? tooltip : <TooltipPrimitive.Provider>{tooltip}</TooltipPrimitive.Provider>;
}
