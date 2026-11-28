import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { ChevronRight, type IconGlyph } from '@/lib/icons';
import type { Turnstile } from '@/lib/turnstile/use-turnstile';
import { cn } from '@/lib/utils';

export function AuthDivider() {
  return (
    <div
      aria-hidden
      className="text-caption text-ink-2 before:bg-rule after:bg-rule flex items-center gap-3 before:h-px before:flex-1 after:h-px after:flex-1"
    >
      or
    </div>
  );
}

export function AuthForm({
  onSubmit,
  children,
}: Readonly<{ onSubmit: NonNullable<ComponentProps<'form'>['onSubmit']>; children: ReactNode }>) {
  return (
    <form noValidate onSubmit={onSubmit} data-auth-form="" className="gap-loose flex flex-col">
      {children}
    </form>
  );
}

export function AuthHumanCheck({
  widget: { container, size, failed },
}: Readonly<{ widget: Pick<Turnstile, 'container' | 'size' | 'failed'> }>) {
  return (
    <fieldset
      aria-label="Verification"
      data-size={size}
      className={cn(
        'm-0 grid min-w-0 justify-items-center overflow-hidden border-0 p-0 *:col-start-1 *:row-start-1 *:self-center',
        size === 'compact' ? 'h-35' : 'h-16.25',
      )}
    >
      <div ref={container} className="w-full" />
      {failed ? (
        <p className="text-caption text-ink-2 text-center">
          Couldn&apos;t load verification. Refresh the page to try again.
        </p>
      ) : null}
    </fieldset>
  );
}

export function AuthLegal({ id, children }: Readonly<{ id?: string; children: ReactNode }>) {
  return (
    <p id={id} className="text-caption text-ink-2 text-balance">
      {children}
    </p>
  );
}

export function AuthActions({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Inline gap="item" wrap>
      {children}
    </Inline>
  );
}

export function AuthLinkRow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="text-body text-ink flex flex-wrap justify-between gap-x-4 gap-y-1">{children}</p>
  );
}

export function AuthRowList({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <ul aria-label={label} className="divide-rule -mx-2 divide-y">
      {children}
    </ul>
  );
}

const AUTH_ROW =
  'focus-ring-inset text-ink hover:overlay-hover rounded-control flex min-h-row w-full cursor-pointer items-center gap-2 px-2 text-left no-underline transition-colors duration-fast motion-reduce:transition-none';

type RowLink = ReactElement<{ className?: string; children?: ReactNode }>;

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
      <span className="text-body text-ink flex min-w-0 flex-1 items-baseline gap-2">
        <span className="text-label text-ink truncate">{name}</span>
        {meta ? <span className="text-ink-2 truncate">{meta}</span> : null}
      </span>
      {trailing}
      <Icon icon={ChevronRight} tone="ink-2" />
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

export function AuthRowTile({ icon }: Readonly<{ icon: IconGlyph }>) {
  return (
    <span aria-hidden className="text-ink-2 grid size-5 shrink-0 place-items-center">
      <Icon icon={icon} />
    </span>
  );
}
