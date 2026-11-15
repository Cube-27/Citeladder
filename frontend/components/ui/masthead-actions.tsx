import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

import { IconButton } from '@/components/ui/button';
import { MENU_PANEL } from '@/components/ui/menu';
import { cn } from '@/lib/utils';

/**
 * Where a masthead draws its one primary action: `undefined` outside a
 * masthead, `null` until the slot has mounted.
 */
export const MastheadPrimarySlot = createContext<HTMLElement | null | undefined>(undefined);

/**
 * The page's one primary action, wherever the actions component renders it:
 * drawn in the masthead's primary slot after the secondary actions, so it
 * stays in view when they fold behind More actions. Outside a masthead it
 * renders in place.
 */
export function MastheadPrimary({ children }: Readonly<{ children: ReactNode }>) {
  const slot = useContext(MastheadPrimarySlot);
  if (slot === undefined) return children;
  return slot ? createPortal(children, slot) : null;
}

/** Popups a folded action opens are portaled outside the panel; pressing in them keeps it open. */
const POPUP_LAYER = '[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"]';

/**
 * The masthead's secondary actions. In a wide masthead they sit in the row.
 * Below `rail`, two or more, or one beside the primary, fold behind a
 * labelled More actions button into a panel under the masthead, rendered once
 * and kept mounted, so their dialogs and state survive it closing. Escape, a
 * press outside or a finished action closes it; Escape returns focus to the
 * button.
 */
export function MastheadOverflow({ children }: Readonly<{ children: ReactNode }>) {
  const panelId = useId();
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const secondary = useChildCount(panel);
  const primary = useChildCount(useContext(MastheadPrimarySlot) ?? null);
  // One secondary action alone stays in the row; beside another action or the primary, it folds.
  const folds = secondary > 1 || (secondary === 1 && primary > 0);
  const close = useEffectEvent((event: Event) => {
    if (!panel) return;
    const outcome = overflowOutcome(event, panel, trigger.current);
    if (outcome === 'stay') return;
    setOpen(false);
    if (outcome === 'refocus') trigger.current?.focus();
  });
  useEffect(() => {
    if (!open) return;
    const events = ['pointerdown', 'click', 'keydown'] as const;
    for (const type of events) document.addEventListener(type, close);
    return () => {
      for (const type of events) document.removeEventListener(type, close);
    };
  }, [open]);

  return (
    <>
      {folds ? (
        <IconButton
          ref={trigger}
          icon={MoreHorizontal}
          label="More actions"
          variant="secondary"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="rail:hidden"
        />
      ) : null}
      <div
        ref={setPanel}
        id={panelId}
        data-masthead-overflow=""
        data-open={open || undefined}
        className={cn(
          'flex min-w-0 items-center gap-2',
          folds &&
            cn(
              MENU_PANEL,
              'not-rail:absolute not-rail:end-0 not-rail:top-full not-rail:hidden not-rail:min-w-56 not-rail:flex-col not-rail:items-stretch not-rail:data-open:flex',
              'rail:contents',
            ),
        )}
      >
        {children}
      </div>
    </>
  );
}

type OverflowOutcome = 'stay' | 'close' | 'refocus';

/** What a document event does to the open panel: Escape inside it closes it and refocuses the button. */
function overflowOutcome(
  event: Event,
  panel: HTMLElement,
  button: HTMLElement | null,
): OverflowOutcome {
  const target = event.target;
  if (!(target instanceof Element)) return 'stay';
  const inside = panel.contains(target) || Boolean(button?.contains(target));
  if (event instanceof KeyboardEvent) return event.key === 'Escape' && inside ? 'refocus' : 'stay';
  if (event.type === 'click') return clickOutcome(target, panel);
  return inside || target.closest(POPUP_LAYER) ? 'stay' : 'close';
}

/** A press that finishes an action closes the panel; one that opens a popup keeps it. */
function clickOutcome(target: Element, panel: HTMLElement): OverflowOutcome {
  const control = target.closest('button, a');
  if (!control || !panel.contains(control)) return 'stay';
  const opensPopup = control.hasAttribute('aria-haspopup') || control.hasAttribute('aria-expanded');
  return opensPopup ? 'stay' : 'close';
}

/** How many elements the box holds, kept current as its children render. */
function useChildCount(node: HTMLElement | null) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!node) return;
    const update = () => setCount(node.childElementCount);
    update();
    const observer = new MutationObserver(update);
    observer.observe(node, { childList: true });
    return () => observer.disconnect();
  }, [node]);
  return count;
}
