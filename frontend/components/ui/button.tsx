import {
  type ComponentPropsWithRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

import { Slot } from '@radix-ui/react-slot';
import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip } from '@/components/ui/tooltip';

import type { IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'danger-confirm';

export type ButtonSize = 'sm' | 'md' | 'lg';

const HOVER_OVERLAY =
  'not-aria-pressed:not-data-[state=open]:not-disabled:hover:overlay-hover aria-pressed:overlay-pressed data-[state=open]:overlay-pressed not-disabled:active:overlay-pressed';

const RAISED_FACE =
  'face bg-raised border border-transparent not-disabled:hover:bg-raised-2 not-disabled:active:bg-raised-2 aria-pressed:bg-raised-2 data-[state=open]:bg-raised-2';

const BUTTON_BASE =
  'focus-ring press text-label text-ink relative inline-flex shrink-0 items-center justify-center gap-2 rounded-control whitespace-nowrap no-underline pointer-coarse:min-h-control-coarse disabled:cursor-not-allowed aria-disabled:cursor-not-allowed [[data-public-surface]_&]:disabled:opacity-disabled [[data-public-surface]_&]:aria-disabled:opacity-disabled';

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-control-sm px-control-x',
  md: 'min-h-control-md px-control-x',
  lg: 'min-h-control-lg px-4',
};

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'face face-primary bg-primary border border-primary text-on-primary not-disabled:hover:bg-primary-hover not-disabled:hover:border-primary-hover',
  secondary:
    'face bg-control-face border border-transparent not-disabled:hover:bg-control-face-hover not-disabled:active:bg-control-face-hover aria-pressed:bg-control-face-hover data-[state=open]:bg-control-face-hover text-ink app:shadow-[var(--control-face-shadow,var(--shadow-field,0_0_transparent))]',
  quiet: cn(
    'bg-transparent text-ink-2 app:text-ink border border-transparent not-disabled:hover:text-ink aria-pressed:text-ink data-[state=open]:text-ink',
    HOVER_OVERLAY,
  ),
  danger: cn(RAISED_FACE, 'face-danger text-negative [[data-public-surface]_&]:border-negative'),
  'danger-confirm':
    'face face-filled bg-negative text-on-ink border border-negative not-disabled:hover:opacity-[90%]',
};

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  className?: string,
  size: ButtonSize = 'md',
) {
  return cn(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className);
}

const BUTTON_BOX = {
  start: 'justify-self-start',
  fit: 'w-fit',
  full: 'max-w-full',
  fixed: 'shrink-0',
  push: 'mr-auto',
  action: 'min-w-22',
  float: 'pointer-events-auto',
  middle: 'align-middle',
  fill: 'w-full',
  share: 'flex-1',
  'rail-hidden': 'rail:hidden',
  'rail-hidden-fixed': 'rail:hidden shrink-0',
  corner: 'absolute top-6 right-6',
  pager: 'size-8 min-h-8',
  'hide-split': 'column-split:hidden',
  'rail-toggle':
    'rail:inline-flex not-labelled:size-rail-button hidden shrink-0 self-center in-data-[nav-drawer]:hidden',
} as const;

type ButtonFrameProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  shape?: keyof typeof SHAPE;
  look?: keyof typeof LOOK;
  pending?: boolean;
  pendingLabel?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export type ButtonProps = Omit<ButtonFrameProps, 'className' | 'style'> & {
  box?: keyof typeof BUTTON_BOX;
};

const ICON_SHAPE = 'w-control-md gap-0 px-0';

const SHAPE = {
  label: undefined,
  icon: ICON_SHAPE,
  floating: cn(ICON_SHAPE, 'shadow-sheet rounded-full'),
  close: cn(ICON_SHAPE, 'size-close min-h-close pointer-coarse:min-h-close press-firm'),
} as const;

const LOOK = {
  launcher: 'text-ink-2 text-left shrink-0 justify-start',
  cta: undefined,
} as const;

function SlottedButton({
  className,
  shape = 'label',
  look,
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
}: Readonly<ButtonFrameProps>) {
  return (
    <Slot
      ref={ref}
      {...props}
      data-button-variant={variant}
      data-button-look={look}
      data-button-shape={shape === 'label' ? undefined : shape}
      aria-busy={pending || undefined}
      className={buttonClasses(variant, cn(SHAPE[shape], look && LOOK[look], className), size)}
    >
      {children}
    </Slot>
  );
}

function NativeButton({
  className,
  shape = 'label',
  look,
  variant = 'secondary',
  size = 'md',
  pending = false,
  pendingLabel,
  type,
  ref,
  children,
  disabled,
  onClick,
  asChild: _asChild,
  ...props
}: Readonly<ButtonFrameProps>) {
  return (
    <button
      ref={ref}
      {...props}
      type={type ?? 'button'}
      data-button-variant={variant}
      data-button-look={look}
      data-button-shape={shape === 'label' ? undefined : shape}
      aria-busy={pending || undefined}
      aria-disabled={pending || props['aria-disabled']}
      disabled={pending ? undefined : disabled}
      onClick={(event) => {
        if (!pending) {
          onClick?.(event);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      }}
      className={buttonClasses(
        variant,
        cn(pending && 'pointer-events-none', SHAPE[shape], look && LOOK[look], className),
        size,
      )}
    >
      <span
        aria-hidden={pending || undefined}
        className={cn('inline-flex items-center gap-2', pending && 'invisible')}
      >
        {children}
      </span>
      {pending ? (
        <span className="absolute inset-0 inline-flex items-center justify-center gap-1 overflow-hidden">
          <Spinner />
          <span className="inline-flex min-w-0 items-center gap-2 truncate">
            {pendingLabel ?? children}
          </span>
        </span>
      ) : null}
    </button>
  );
}

type SlotClass = { className?: string };

function SlotMergedButton({
  box,
  className: slotClass,
  ...props
}: Readonly<ButtonProps & SlotClass>) {
  const className = cn(slotClass, box && BUTTON_BOX[box]) || undefined;
  return props.asChild ? (
    <SlottedButton {...props} className={className} />
  ) : (
    <NativeButton {...props} className={className} />
  );
}

export const Button: (props: Readonly<ButtonProps>) => ReactElement = SlotMergedButton;

type IconButtonProps = Omit<ButtonProps, 'variant' | 'children' | 'asChild' | 'aria-label'> & {
  icon: IconGlyph;
  label: string;
  variant?: Extract<ButtonVariant, 'quiet' | 'secondary' | 'primary'>;
  shortcut?: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  tooltip?: boolean;
  href?: string;
  shape?: Exclude<keyof typeof SHAPE, 'label'>;
};

function IconLinkTarget({
  href,
  label,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithRef<'a'>, 'href' | 'aria-label'> & { href: string; label: string }
>) {
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

export function IconButton({
  icon,
  label,
  href,
  variant = 'quiet',
  shortcut,
  tooltipSide = 'top',
  tooltip = true,
  shape = 'icon',
  ...props
}: Readonly<IconButtonProps>) {
  const control = href ? (
    <Button {...props} variant={variant} shape={shape} asChild>
      <IconLinkTarget href={href} label={label}>
        <Icon icon={icon} />
      </IconLinkTarget>
    </Button>
  ) : (
    <Button
      {...props}
      variant={variant}
      shape={shape}
      aria-label={label}
      pendingLabel={<span className="sr-only">{props.pendingLabel ?? label}</span>}
    >
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
