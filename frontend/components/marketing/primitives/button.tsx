import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { buttonClasses } from '@/components/ui/button';
import { appHref } from '@/lib/config/app-link';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'soft';
type VisualProps = Readonly<{ variant?: Variant; className?: string }>;

const SHARED_VARIANT = {
  primary: 'primary',
  soft: 'secondary',
} as const satisfies Record<Variant, 'primary' | 'secondary'>;

function buttonLinkAttributes({ variant = 'primary', className }: VisualProps) {
  const shared = SHARED_VARIANT[variant];
  return {
    'data-marketing-cta': '',
    'data-button-variant': shared,
    'data-button-look': 'cta',
    className: cn(buttonClasses(shared), '[&_svg]:size-4 [&_svg]:shrink-0', className),
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
