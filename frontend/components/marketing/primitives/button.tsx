import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { buttonClasses } from '@/components/ui/button';
import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'dark' | 'nav' | 'ghost' | 'soft';
type VisualProps = Readonly<{ variant?: Variant; size?: 'lg' | 'marketing'; className?: string }>;

/** `dark` and `nav` are marketing-only skins over the shared secondary. */
const SHARED_VARIANT: Record<Variant, 'primary' | 'secondary' | 'ghost'> = {
  primary: 'primary',
  ghost: 'ghost',
  dark: 'secondary',
  nav: 'secondary',
  soft: 'secondary',
};

const sharedVariant = (variant: Variant) => SHARED_VARIANT[variant];

/** A marketing button link's attributes. */
function buttonLinkAttributes({ variant = 'primary', size = 'lg', className }: VisualProps) {
  const shared = sharedVariant(variant);
  return {
    'data-marketing-cta': '',
    'data-button-variant': shared,
    'data-button-size': size,
    className: cn(
      buttonClasses(shared),
      '[&_svg]:size-4 [&_svg]:shrink-0',
      variant !== 'ghost' && variant !== 'nav' && 'marketing-cta-button',
      variant === 'soft' && 'marketing-soft-button',
      className,
    ),
  };
}

export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
  ...rest
}: VisualProps & { href: string; children: ReactNode } & Omit<
    ComponentPropsWithoutRef<'a'>,
    'href' | 'className' | 'children'
  >) {
  return (
    <a href={href} {...buttonLinkAttributes({ variant, size, className })} {...rest}>
      {children}
    </a>
  );
}

/**
 * The demo CTA, in one place.
 *
 * The shared destination keeps demo enquiries on CiteLadder.
 */
export function DemoButtonLink({
  variant = 'primary',
  className,
  children,
  ...rest
}: VisualProps & { children?: ReactNode } & Omit<
    ComponentPropsWithoutRef<'a'>,
    'href' | 'className' | 'children' | 'target' | 'rel'
  >) {
  return (
    <ButtonLink
      href={DEMO_HREF}
      data-demo-cta=""
      variant={variant}
      className={className}
      {...(DEMO_EXTERNAL ? { target: '_blank', rel: 'noreferrer' } : {})}
      {...rest}
    >
      {children ?? DEMO_CTA}
    </ButtonLink>
  );
}
