import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The buttons on the public surface (docs/website-design-system.md §5.1–5.2).
 *
 * The signature construction is a translucent outer RING wrapping a solid
 * inner PILL — the same layering that defines badges and feature cards. The
 * ring is glass, the pill carries the accent gradient plus the paired inset
 * highlights, and the label sits on top. `Button`/`ButtonLink` render that
 * shell; `IconButton`/`IconButtonLink` add the travelling arrow badge, whose
 * choreography needs real CSS and lives in marketing-cta.css.
 *
 * Four variants, no more: Primary (accent gradient), Dark (dark gradient),
 * Nav (dark gradient at chrome scale, no ring), Ghost (transparent, hairline).
 */
const VARIANT = {
  primary: {
    ring: 'mkt-glass p-mkt-6 rounded-mkt-pill',
    pill: 'mkt-gradient-accent inset-shadow-mkt-inner shadow-mkt-accent border-mkt-white-10 text-mkt-paper',
  },
  dark: {
    // Ink-tinted ring, matching `.mkt-icon-btn--dark`: a white case around a
    // black pill reads as a third colour rather than a housing.
    ring: 'mkt-glass p-mkt-6 rounded-mkt-pill border-mkt-black-20',
    pill: 'mkt-gradient-dark inset-shadow-mkt-inner shadow-mkt-nav border-mkt-white-10 text-mkt-paper',
  },
  nav: {
    ring: '',
    pill: 'mkt-gradient-dark border-mkt-white-10 text-mkt-paper',
  },
  ghost: {
    ring: '',
    pill: 'border-mkt-black-10 text-mkt-ink bg-transparent',
  },
} as const;

type Variant = keyof typeof VARIANT;

/**
 * Desktop 12/30 · Nav 10/24 · Phone 8/20. The label rung stays Text Button at
 * every size — the sizes differ in padding, not in type.
 */
const PADDING = {
  default: 'px-mkt-20 py-mkt-10 sm:px-mkt-30 sm:py-mkt-14',
  nav: 'px-mkt-20 py-mkt-10',
} as const;

const PILL_BASE =
  'rounded-mkt-pill inline-flex items-center justify-center gap-mkt-10 overflow-hidden border ' +
  'text-mkt-button whitespace-nowrap ' +
  'duration-mkt-micro ease-mkt-micro transition-[box-shadow,background-color,border-color] ' +
  '[&_svg]:size-4 [&_svg]:shrink-0';

type ButtonVisualProps = Readonly<{
  variant?: Variant;
  className?: string;
}>;

function shell(variant: Variant) {
  const { ring, pill } = VARIANT[variant];
  const padding = variant === 'nav' ? PADDING.nav : PADDING.default;
  return {
    ring: cn('inline-flex w-max items-center justify-center', ring),
    pill: cn(PILL_BASE, pill, padding),
  };
}

/** Marketing CTA rendered as a link. Internal hrefs route through next/link. */
export function ButtonLink({
  href,
  variant = 'primary',
  className,
  children,
  ...rest
}: ButtonVisualProps & { href: string; children: ReactNode } & Omit<
    ComponentPropsWithoutRef<'a'>,
    'href' | 'className' | 'children'
  >) {
  const { ring, pill } = shell(variant);
  const props = { className: cn(ring, className), ...rest };
  const content = <span className={pill}>{children}</span>;
  // Hash links and mailto/tel stay plain anchors — next/link would intercept
  // the hash into a route transition and swallow the smooth scroll.
  return href.startsWith('/') ? (
    <Link href={href} {...props}>
      {content}
    </Link>
  ) : (
    <a href={href} {...props}>
      {content}
    </a>
  );
}

/**
 * Marketing action rendered as a real button (menus, toggles, submits).
 *
 * The disabled treatment sits on the OUTER element rather than in
 * `PILL_BASE`: the pill is a child span, so a `disabled:` variant there never
 * matches. Dimming the shell carries the ring and the pill together. The auth
 * forms submit through this primitive, so without it a pending submit looked
 * identical to an idle one.
 */
export function Button({
  variant = 'primary',
  className,
  children,
  type = 'button',
  ...rest
}: ButtonVisualProps & { children: ReactNode } & Omit<
    ComponentPropsWithoutRef<'button'>,
    'className' | 'children'
  >) {
  const { ring, pill } = shell(variant);
  return (
    <button
      type={type}
      className={cn(ring, 'disabled:cursor-not-allowed disabled:opacity-60', className)}
      {...rest}
    >
      <span className={pill}>{children}</span>
    </button>
  );
}

/**
 * The COLOUR of the icon button. `default` is the accent gradient; it emits no
 * modifier class because the base rule already paints it.
 */
export type IconButtonVariant = 'default' | 'dark' | 'nav';

/**
 * Which edge the arrow travels toward. Orthogonal to the colour: these were one
 * union until `dark` and `right-icon` turned out to be mutually exclusive, so a
 * dark button could never send its arrow right.
 */
export type IconButtonSide = 'left' | 'right';

type IconButtonProps = Readonly<{
  title: string;
  variant?: IconButtonVariant;
  side?: IconButtonSide;
  icon?: ReactNode;
  className?: string;
}>;

/**
 * The signature interaction: two identical arrow badges trade places on hover
 * while the label's padding flips in the same beat, so the arrow reads as one
 * object travelling THROUGH the control rather than two discs cross-fading.
 *
 * Both badges are aria-hidden and the label is never duplicated, so the
 * control announces once. The choreography is in marketing-cta.css.
 */
function iconShell({
  title,
  variant = 'default',
  side = 'left',
  icon,
  className,
}: IconButtonProps) {
  return {
    // Only non-default modifiers are emitted — `mkt-icon-btn--default` styled
    // nothing and just added noise to every button's class list.
    className: cn(
      'mkt-icon-btn',
      variant !== 'default' && `mkt-icon-btn--${variant}`,
      side === 'right' && 'mkt-icon-btn--right-icon',
      className,
    ),
    content: (
      <span className="mkt-icon-btn__pill">
        <span className="mkt-icon-btn__label">{title}</span>
        <span aria-hidden className="mkt-icon-btn__badge mkt-icon-btn__badge--outgoing">
          {icon ?? <ArrowRight aria-hidden />}
        </span>
        <span aria-hidden className="mkt-icon-btn__badge mkt-icon-btn__badge--incoming">
          {icon ?? <ArrowRight aria-hidden />}
        </span>
      </span>
    ),
  };
}

export function IconButtonLink({
  href,
  openInNewTab = false,
  rel,
  title,
  variant,
  side,
  icon,
  className,
  ...rest
}: IconButtonProps & { href: string; openInNewTab?: boolean } & Omit<
    ComponentPropsWithoutRef<'a'>,
    'href' | 'target' | 'className' | 'children' | 'title'
  >) {
  const shell = iconShell({ title, variant, side, icon, className });
  const targetProps = openInNewTab
    ? { target: '_blank' as const, rel: rel ?? 'noopener noreferrer' }
    : { rel };
  // `...rest` is forwarded, not dropped: the visual props are pulled out by
  // name above, so everything left is a real anchor attribute (id, aria-*,
  // onClick, data-*) that the caller expects to land on the element.
  const props = { className: shell.className, ...targetProps, ...rest };
  const content = shell.content;
  return href.startsWith('/') ? (
    <Link href={href} {...props}>
      {content}
    </Link>
  ) : (
    <a href={href} {...props}>
      {content}
    </a>
  );
}

export function IconButton({
  type = 'button',
  ...visual
}: IconButtonProps & Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children' | 'title'>) {
  const { title, variant, side, icon, className, ...rest } = visual;
  const shellProps = iconShell({ title, variant, side, icon, className });
  return (
    <button type={type} className={shellProps.className} {...rest}>
      {shellProps.content}
    </button>
  );
}

/** Underlined text action — the quieter tertiary step. */
export function TextLink({
  href,
  children,
  className,
}: Readonly<{ href: string; children: ReactNode; className?: string }>) {
  const cls = cn(
    'text-mkt-ink border-mkt-black-10 hover:border-mkt-ink gap-mkt-10 inline-flex items-center',
    'text-mkt-xsb duration-mkt-micro border-b pb-mkt-6 transition-colors',
    '[&_svg]:size-4 [&_svg]:shrink-0',
    className,
  );
  return href.startsWith('/') ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <a href={href} className={cls}>
      {children}
    </a>
  );
}
