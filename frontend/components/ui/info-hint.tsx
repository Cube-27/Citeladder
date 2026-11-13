import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { focusFromKeyboard } from '@/components/ui/input-modality';

/**
 * A short explanation attached to a label, without spending a line on it.
 *
 * The visibility screens used to print each measure's definition as permanent
 * body copy under the number — a "Calculation" disclosure on every metric, and
 * a two-sentence caveat above the Searches table. The explanation is worth
 * keeping and worth reaching; it is not worth the reader's first three seconds.
 *
 * A toggletip: a press or tap opens it and a second one closes it, as do Esc,
 * a press elsewhere and focus moving on; a keyboard reader's Tab opens it too.
 * Hover does not, so touch and mouse readers meet the same control. It looks
 * like a Tooltip and is portalled like one, since a dialog's or drawer's panel
 * would otherwise clip it. The button's name is the short label; assistive
 * technology hears the explanation as its description on reaching it, so the
 * portalled panel's place in the document does not matter. The button is the
 * 32px control target around the 12px glyph, with negative margin so the
 * larger hit area does not push the label beside it.
 */
export function InfoHint({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        aria-label={label}
        aria-describedby={descriptionId}
        // The panel only shows the description; it is not a popup to expand into.
        aria-haspopup={undefined}
        aria-expanded={undefined}
        aria-controls={undefined}
        onFocus={() => {
          if (focusFromKeyboard()) setOpen(true);
        }}
        className="focus-ring text-ink-muted hover:text-ink -m-2 inline-flex size-8 items-center justify-center align-middle"
      >
        <Info className="size-3" aria-hidden />
      </PopoverPrimitive.Trigger>
      <span id={descriptionId} hidden>
        {children}
      </span>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          role="tooltip"
          side="top"
          sideOffset={8}
          // Focus stays on the button; returning it there on close would reopen the tip.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="tooltip-panel bg-ink text-on-ink z-modal text-caption inline-flex max-w-72 items-center gap-2 rounded-sm px-2 py-1"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
