import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { buttonClasses } from '@/components/ui/button';
import { appHref } from '@/lib/config/app-link';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'dark' | 'nav' | 'ghost' | 'soft';
type VisualProps = Readonly<{ variant?: Variant; className?: string }>;

const SHARED_VARIANT: Record<Variant, 'primary' | 'secondary' | 'quiet'> = {
  primary: 'primary',
  ghost: 'quiet',
  dark: 'secondary',
  nav: 'secondary',
  soft: 'secondary',
};

const sharedVariant = (variant: Variant) => SHARED_VARIANT[variant];

function buttonLinkAttributes({ variant = 'primary', className }: VisualProps) {
  const shared = sharedVariant(variant);
  return {
    'data-marketing-cta': '',
    'data-button-variant': shared,
    'data-button-look': variant === 'ghost' || variant === 'nav' ? undefined : 'cta',
    className: cn(
      buttonClasses(shared),
      '[&_svg]:size-4 [&_svg]:shrink-0',
      variant === 'soft' && 'marketing-soft-button',
      className,
    ),
  };
}

export function ButtonLink({
  href,
  variant,
  className,
  children,
  ...rest
}: VisualProps & { href: string; children: ReactNode } & Omit<
    ComponentPropsWithoutRef<'a'>,
    'href' | 'className' | 'children'
  >) {
  return (
    <a href={href} {...buttonLinkAttributes({ variant, className })} {...rest}>
      {children}
    </a>
  );
}

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

export function SiteActions() {
  const signup = selfServeSignupOpen();
  return (
    <>
      {signup ? <ButtonLink href={appHref('/register')}>Start free trial</ButtonLink> : null}
      <DemoButtonLink variant={signup ? 'soft' : 'primary'} />
    </>
  );
}
