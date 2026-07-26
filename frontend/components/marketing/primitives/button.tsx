import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The one button on the Proof surface. Four intents, two sizes — the deck's
 * `.btn-primary / -secondary / -blue / -night` collapsed onto tokens.
 *
 * The lift is 2px on a long ease-out, matched to the deck's motion budget
 * (5/10): enough to feel physical, not enough to read as a bounce.
 */
const INTENT = {
  /** Default page action — exact ink on paper. */
  primary: 'bg-mkt-ink text-mkt-surface shadow-mkt-ink hover:bg-mkt-ink/90 hover:shadow-mkt-float',
  /** Companion action — hairline on surface. */
  secondary:
    'bg-mkt-surface text-mkt-ink border-mkt-line hover:border-mkt-line-strong hover:shadow-mkt-raised',
  /** In-product / active-state action. */
  proof: 'bg-mkt-proof text-mkt-surface hover:bg-mkt-proof-text',
  /** For use ON the wallpaper, where a white button would disappear. */
  scene: 'bg-mkt-slate text-mkt-surface hover:bg-mkt-ink',
} as const;

// Both sizes carry the same 13px label — they differ in height and padding,
// not in type size. Shrinking the text too would drop it below the ramp.
const SIZE = {
  md: 'min-h-12 rounded-mkt-sm px-5 text-mkt-sm',
  sm: 'min-h-9.5 rounded-mkt-xs px-3.5 text-mkt-sm',
} as const;

const BASE =
  'inline-flex items-center justify-center gap-2.5 border border-transparent font-bold ' +
  'transition-[transform,background-color,border-color,box-shadow] duration-[450ms] ' +
  'ease-mkt-out hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40 ' +
  '[&_svg]:transition-transform [&_svg]:duration-[450ms] [&_svg]:ease-mkt-out ' +
  'hover:[&_svg]:translate-x-0.5';

type ButtonVisualProps = Readonly<{
  intent?: keyof typeof INTENT;
  size?: keyof typeof SIZE;
  className?: string;
}>;

function classes({ intent = 'primary', size = 'md', className }: ButtonVisualProps) {
  return cn(BASE, INTENT[intent], SIZE[size], className);
}

/** Marketing CTA rendered as a link. Internal hrefs route through next/link. */
export function ButtonLink({
  href,
  intent,
  size,
  className,
  children,
  ...rest
}: ButtonVisualProps & { href: string; children: ReactNode } & Omit<
    ComponentPropsWithoutRef<'a'>,
    'href' | 'className' | 'children'
  >) {
  const props = { className: classes({ intent, size, className }), ...rest };
  // Hash links and mailto/tel must stay plain anchors — next/link would
  // intercept the hash into a route transition and swallow the smooth scroll.
  return href.startsWith('/') ? (
    <Link href={href} {...props}>
      {children}
    </Link>
  ) : (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

/** Marketing action rendered as a real button (menus, toggles, submits). */
export function Button({
  intent,
  size,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonVisualProps & { children: ReactNode } & Omit<
    ComponentPropsWithoutRef<'button'>,
    'className' | 'children'
  >) {
  return (
    <button type={type} className={classes({ intent, size, className })} {...rest}>
      {children}
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
    'text-mkt-ink border-mkt-line-strong hover:border-mkt-ink inline-flex items-center gap-2',
    'border-b pb-0.5 text-mkt-sm font-bold transition-colors duration-200',
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
