import type { ComponentPropsWithRef, ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Slot } from '@radix-ui/react-slot';
import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip } from '@/components/ui/tooltip';

import { cn } from '@/lib/utils';

/**
 * The four buttons (brand direction 3.1). Actions are ink, never the accent:
 * `primary` is the one ink-filled action a view is for, `secondary` a
 * `surface` button with the control line, `quiet` no edge (`ink-2`, `ink`
 * on hover) for toolbars, rows and navigation, `danger` a crimson label and
 * line (filled only in a confirm dialog, `danger-confirm`). Hover is the 6%
 * ink tint, pressed and open the 10% tint; nothing moves.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'danger-confirm';

/**
 * Heights 32 (default) and 44 (flow pages); below 900px or under a coarse
 * pointer every control is 44 (brand direction 2.2). Controls in one row
 * share one size.
 */
export type ButtonSize = 'md' | 'lg';

/** Hover, unless the button is toggled on or its menu is open. */
const HOVER_OVERLAY =
  'not-aria-pressed:not-data-[state=open]:not-disabled:hover:overlay-hover aria-pressed:overlay-pressed data-[state=open]:overlay-pressed not-disabled:active:overlay-pressed';

// The website keeps its 8px icon gap and 45% disabled face (it is not redesigned).
const BUTTON_BASE =
  'focus-ring type-label relative inline-flex shrink-0 items-center justify-center gap-1 rounded-control whitespace-nowrap no-underline transition-[background-color,color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 [[data-public-surface]_&]:gap-2 [[data-public-surface]_&]:disabled:opacity-45 [[data-public-surface]_&]:aria-disabled:opacity-45';

const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: 'min-h-[var(--control-md)] px-3',
  lg: 'min-h-[var(--control-lg)] px-4',
};

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-on-ink border border-ink not-disabled:hover:bg-ink-hover aria-disabled:hover:bg-ink pointer-coarse:min-h-[var(--control-coarse)]',
  secondary: cn('bg-surface text-ink border-control-line border', HOVER_OVERLAY),
  quiet: cn(
    'bg-transparent text-ink-2 border border-transparent not-disabled:hover:text-ink aria-pressed:text-ink data-[state=open]:text-ink',
    HOVER_OVERLAY,
  ),
  danger: cn('bg-surface text-negative border-negative border', HOVER_OVERLAY),
  'danger-confirm':
    'bg-negative text-on-ink border border-negative not-disabled:hover:opacity-90 pointer-coarse:min-h-[var(--control-coarse)]',
};

/** A masthead button whose word shows only from `shell`: below it, a square icon control. */
export const LABEL_FROM_SHELL = 'w-[var(--control-md)] justify-center px-0 shell:w-auto shell:px-3';

/** The button face for an element that is not a `Button` (a link styled as one). */
export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  className?: string,
  size: ButtonSize = 'md',
) {
  return cn(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className);
}

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element as the button (Radix Slot) instead of a <button>. */
  asChild?: boolean;
  pending?: boolean;
  pendingLabel?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

function SlottedButton({
  className,
  variant = 'secondary',
  size = 'md',
  pending = false,
  ref,
  children,
  disabled: _disabled,
  pendingLabel: _pendingLabel,
  type: _type,
  asChild: _asChild,
  ...props
}: Readonly<ButtonProps>) {
  return (
    <Slot
      ref={ref}
      {...props}
      data-button-variant={variant}
      aria-busy={pending || undefined}
      className={buttonClasses(variant, className, size)}
    >
      {children}
    </Slot>
  );
}

function NativeButton({
  className,
  variant = 'secondary',
  size = 'md',
  pending = false,
  pendingLabel,
  type,
  ref,
  children,
  asChild: _asChild,
  ...props
}: Readonly<ButtonProps>) {
  return (
    <button
      ref={ref}
      {...props}
      type={type ?? 'button'}
      data-button-variant={variant}
      aria-busy={pending || undefined}
      disabled={props.disabled || pending}
      className={buttonClasses(variant, className, size)}
    >
      {/* Busy keeps the button's width: the label keeps its box (hidden) and
          the live rung with the pending verb takes its place inside it. The
          pending label is what assistive technology hears. */}
      <span
        aria-hidden={pending || undefined}
        className={cn('inline-flex items-center gap-2', pending && 'invisible')}
      >
        {children}
      </span>
      {pending ? (
        <span className="absolute inset-0 inline-flex items-center justify-center gap-1 overflow-hidden px-2">
          <Spinner />
          {pendingLabel ? (
            <span className="truncate">{pendingLabel}</span>
          ) : (
            <span className="sr-only">{children}</span>
          )}
        </span>
      ) : null}
    </button>
  );
}

/**
 * One form per size: the size's control height (taller only when the reader's
 * text size grows its label), the control radius, the 16px icon 4px before
 * the label.
 */
export function Button(props: Readonly<ButtonProps>) {
  return props.asChild ? <SlottedButton {...props} /> : <NativeButton {...props} />;
}

type IconButtonProps = Omit<ButtonProps, 'variant' | 'children' | 'asChild' | 'aria-label'> & {
  icon: LucideIcon;
  /** The accessible name and the tooltip: what pressing it does. */
  label: string;
  /**
   * `quiet` (default) in toolbars and rows; `secondary` alone on the ground;
   * `primary` only for a form's one submit (the composer's Send).
   */
  variant?: Extract<ButtonVariant, 'quiet' | 'secondary' | 'primary'>;
  /** A shortcut shown in the tooltip. */
  shortcut?: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** `false` only where the same words are visible beside it (a dialog's close). */
  tooltip?: boolean;
  /**
   * A link that looks like the icon control: an app path (`/runs`) goes
   * through `ProjectLink`, scoped to the active project like any app link;
   * an http(s) URL stays an external link with no referrer.
   */
  href?: string;
};

/** The anchor an icon link renders: the project's router link for an app path. */
function IconLinkTarget({
  href,
  label,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithRef<'a'>, 'href' | 'aria-label'> & { href: string; label: string }
>) {
  // `//host/path` is protocol-relative: another site, not an app path.
  if (href.startsWith('/') && !href.startsWith('//')) {
    return (
      <ProjectLink {...props} href={href} aria-label={label}>
        {children}
      </ProjectLink>
    );
  }
  const external = /^(https?:)?\/\//i.test(href);
  return (
    <a {...props} href={href} aria-label={label} rel={external ? 'noreferrer' : undefined}>
      {children}
    </a>
  );
}

/**
 * IconButton — the square icon-only control for universal actions (close,
 * more, copy, sort, collapse): square at the control height, quiet by default, the 16px
 * glyph, and a required `label` that is both its accessible name and its
 * tooltip (shown after 300ms on hover, at once on keyboard focus).
 */
export function IconButton({
  icon,
  label,
  href,
  variant = 'quiet',
  shortcut,
  tooltipSide = 'top',
  tooltip = true,
  className,
  ...props
}: Readonly<IconButtonProps>) {
  const classes = cn('w-[var(--control-md)] gap-0 px-0', className);
  const control = href ? (
    <Button {...props} variant={variant} className={classes} asChild>
      <IconLinkTarget href={href} label={label}>
        <Icon icon={icon} />
      </IconLinkTarget>
    </Button>
  ) : (
    <Button {...props} variant={variant} className={classes} aria-label={label}>
      <Icon icon={icon} />
    </Button>
  );
  if (!tooltip) return control;
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide} describe={false}>
      {control}
    </Tooltip>
  );
}
