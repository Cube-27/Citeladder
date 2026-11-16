import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import type { Turnstile } from '@/lib/turnstile/use-turnstile';
import { cn } from '@/lib/utils';

/*
 * The parts of a Flow page's forms (sign-in, sign-up, the mailbox screens,
 * the workspace chooser): the frame and the heading are the Flow template's
 * (components/templates/flow-page.tsx).
 */

/** The form's full-width action: the submit, or "Continue with Google". */
export function AuthButton(props: Readonly<Omit<ButtonProps, 'className'>>) {
  return <Button {...props} className="w-full" />;
}

/**
 * The "or" between Google and the email form: a hairline either side. It is
 * decoration: both ways in are announced in reading order on their own.
 */
export function AuthDivider() {
  return (
    <div
      aria-hidden
      className="type-caption text-ink-2 before:bg-rule after:bg-rule flex items-center gap-3 before:h-px before:flex-1 after:h-px after:flex-1"
    >
      or
    </div>
  );
}

/** The email form's fields, check and submit, `space-4` apart. */
export function AuthForm({
  onSubmit,
  children,
}: Readonly<{ onSubmit: NonNullable<ComponentProps<'form'>['onSubmit']>; children: ReactNode }>) {
  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {children}
    </form>
  );
}

/**
 * The Cloudflare Turnstile slot: the flexible widget's 65px (the compact
 * widget's 140px on a slot narrower than 300px), reserved before the widget
 * loads and kept after it completes, so the submit never moves. A notice
 * shares the same cell when the widget cannot load.
 */
export function AuthHumanCheck({
  widget: { container, size, failed },
}: Readonly<{ widget: Pick<Turnstile, 'container' | 'size' | 'failed'> }>) {
  return (
    <fieldset
      aria-label="Verification"
      data-size={size}
      className={cn(
        'm-0 grid min-w-0 justify-items-center overflow-hidden border-0 p-0 *:col-start-1 *:row-start-1 *:self-center',
        size === 'compact' ? 'h-[140px]' : 'h-[65px]',
      )}
    >
      {/* Full width so the hook measures the slot, not an empty box (0px → compact). */}
      <div ref={container} className="w-full" />
      {failed ? (
        <p className="type-caption text-ink-2 text-center">
          Couldn&apos;t load verification. Refresh the page to try again.
        </p>
      ) : null}
    </fieldset>
  );
}

/** The agreement line closing the form: a caption in `ink-2`. */
export function AuthLegal({ id, children }: Readonly<{ id?: string; children: ReactNode }>) {
  return (
    <p id={id} className="type-caption text-ink-2 text-balance">
      {children}
    </p>
  );
}

/** A row of the flow's buttons, 8 apart, wrapping on a phone. */
export function AuthActions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** A row of small links inside the form (14/20), spread to its edges. */
export function AuthLinkRow({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="type-body flex flex-wrap justify-between gap-x-4 gap-y-1">{children}</p>;
}

/**
 * A list of whole-row choices (the workspace chooser's rows), divided by rules
 * and never boxed: it sits inside the AuthCard, and a container never holds a
 * second bordered box.
 */
export function AuthRowList({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <ul aria-label={label} className="divide-rule rounded-control divide-y overflow-hidden">
      {children}
    </ul>
  );
}

const AUTH_ROW =
  'focus-ring-inset text-ink hover:overlay-hover flex min-h-18 w-full cursor-pointer items-center gap-3 px-4 text-left no-underline transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none';

type RowLink = ReactElement<{ className?: string; children?: ReactNode }>;

/**
 * One 72px row: a 40px lead, the name (16/24 medium) over a meta line (14/20
 * `ink-muted`), an optional trailing badge and a chevron. Hover is
 * `surface-sunken`, focus a 2px inset ring; long names end in an ellipsis.
 * The row is a button (`onSelect`) or the caller's link element (`link`).
 */
export function AuthRow({
  lead,
  name,
  meta,
  trailing,
  action,
}: Readonly<{
  lead: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  action: { onSelect: () => void } | { link: RowLink };
}>) {
  const content = (
    <>
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-label text-ink truncate">{name}</span>
        {meta ? <span className="type-body text-ink-2 truncate">{meta}</span> : null}
      </span>
      {trailing}
      <Icon icon={ChevronRight} className="text-ink-2" />
    </>
  );
  return (
    <li>
      {'link' in action ? (
        cloneElement(action.link, { className: AUTH_ROW, children: content })
      ) : (
        <button type="button" onClick={action.onSelect} className={AUTH_ROW}>
          {content}
        </button>
      )}
    </li>
  );
}

/** The create row's lead: a 40px inset tile with the glyph (dashed is for drafts only). */
export function AuthRowTile({ icon }: Readonly<{ icon: LucideIcon }>) {
  return (
    <span
      aria-hidden
      className="bg-well text-ink-2 rounded-control grid size-10 shrink-0 place-items-center"
    >
      <Icon icon={icon} />
    </span>
  );
}
