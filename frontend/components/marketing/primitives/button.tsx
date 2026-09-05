import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { Button as SharedButton } from '@/components/ui/button';
import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'dark' | 'nav' | 'ghost';
type VisualProps = Readonly<{ variant?: Variant; className?: string }>;

const sharedVariant = (variant: Variant) =>
  variant === 'ghost' ? 'ghost' : variant === 'primary' ? 'primary' : 'secondary';

const marketingSecondary =
  'border-border-strong bg-panel hover:border-border-bold hover:bg-background-alt';

export function ButtonLink({
  href,
  variant = 'primary',
  className,
  children,
  ...rest
}: VisualProps & { href: string; children: ReactNode } & Omit<
    ComponentPropsWithoutRef<'a'>,
    'href' | 'className' | 'children'
  >) {
  return (
    <SharedButton
      asChild
      variant={sharedVariant(variant)}
      className={cn(
        'rounded-full min-h-[2.75rem] px-6 text-sm font-medium tracking-tight shadow-sm transition-all duration-200',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        (variant === 'dark' || variant === 'nav') && marketingSecondary,
        className,
      )}
    >
      <Link href={href} {...rest}>
        {children}
      </Link>
    </SharedButton>
  );
}

/**
 * The demo CTA, in one place.
 *
 * The funnel leaves this site for the parent company's contact form, so every
 * one of the dozen call sites would otherwise have to remember `target` and a
 * safe `rel`. They call this instead, and if the destination ever comes back
 * in-house only `DEMO_EXTERNAL` changes.
 */
export function DemoButtonLink({
  variant = 'primary',
  className,
  children,
}: VisualProps & { children?: ReactNode }) {
  return (
    <ButtonLink
      href={DEMO_HREF}
      variant={variant}
      className={className}
      {...(DEMO_EXTERNAL ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children ?? DEMO_CTA}
    </ButtonLink>
  );
}

/**
 * The demo CTA as a text link, for the places the segment layout wants a link
 * rather than a button. Same external contract as `DemoButtonLink` — the
 * funnel leaves the site, so `target` and a safe `rel` belong here and not at
 * the call site.
 */
export function DemoTextLink({
  className,
  children,
}: Readonly<{ className?: string; children?: ReactNode }>) {
  return (
    <TextLink
      href={DEMO_HREF}
      className={className}
      {...(DEMO_EXTERNAL ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children ?? DEMO_CTA}
    </TextLink>
  );
}

/**
 * Module-private: the only text link the marketing surface renders is the demo
 * CTA, and that goes through `DemoTextLink` so the external target and `rel`
 * are never left to a call site. Export this again when a second, genuinely
 * different text link exists.
 */
function TextLink({
  href,
  className,
  children,
  ...rest
}: { href: string; className?: string; children: ReactNode } & Omit<
  ComponentPropsWithoutRef<'a'>,
  'href' | 'className' | 'children'
>) {
  return (
    <Link
      href={href}
      className={cn(
        'group text-foreground hover:text-accent-text inline-flex items-center gap-1.5 font-medium underline underline-offset-4 decoration-border-strong hover:decoration-accent transition-colors',
        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200 group-hover:[&_svg]:translate-x-0.5 group-hover:[&_svg]:-translate-y-0.5',
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

type IconButtonVariant = 'default' | 'dark' | 'nav';
type IconButtonSide = 'left' | 'right';

type IconButtonProps = Readonly<{
  title: string;
  variant?: IconButtonVariant;
  side?: IconButtonSide;
  icon?: ReactNode;
  className?: string;
}>;

export function IconButtonLink({
  href,
  openInNewTab = false,
  rel,
  title,
  variant = 'default',
  side = 'right',
  icon,
  className,
  ...rest
}: IconButtonProps & { href: string; openInNewTab?: boolean } & Omit<
    ComponentPropsWithoutRef<'a'>,
    'href' | 'target' | 'className' | 'children' | 'title'
  >) {
  const targetProps = openInNewTab
    ? { target: '_blank' as const, rel: rel ?? 'noopener noreferrer' }
    : { rel };
  const arrow = icon ?? <ArrowRight aria-hidden className="size-4" />;
  return (
    <SharedButton
      asChild
      variant={variant === 'default' ? 'primary' : 'secondary'}
      className={cn(
        'rounded-full min-h-[2.75rem] px-6 text-sm font-medium tracking-tight shadow-sm transition-all duration-200',
        variant !== 'default' && marketingSecondary,
        className,
      )}
    >
      <Link href={href} {...targetProps} {...rest}>
        {side === 'left' ? arrow : null}
        <span>{title}</span>
        {side === 'right' ? arrow : null}
      </Link>
    </SharedButton>
  );
}
