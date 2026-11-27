import type { MouseEventHandler, ReactNode } from 'react';

import { buttonClasses } from '@/components/ui/button';
import { appHref } from '@/lib/config/app-link';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'soft';
const BOX = {
  fill: 'w-full',
  'hide-sm': 'cl-navbar-hide-sm',
  sheet: 'cl-btn-lg w-full',
} as const;

type VisualProps = Readonly<{ variant?: Variant; box?: keyof typeof BOX }>;

const SHARED_VARIANT = {
  primary: 'primary',
  soft: 'secondary',
} as const satisfies Record<Variant, 'primary' | 'secondary'>;

function buttonLinkAttributes({ variant = 'primary', box }: VisualProps) {
  const shared = SHARED_VARIANT[variant];
  return {
    'data-marketing-cta': '',
    'data-button-variant': shared,
    'data-button-look': 'cta',
    className: cn(buttonClasses(shared), '[&_svg]:size-4 [&_svg]:shrink-0', box && BOX[box]),
  };
}

type LinkProps = VisualProps &
  Readonly<{
    children?: ReactNode;
    rel?: string;
    target?: string;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }>;

export function ButtonLink({
  href,
  variant,
  box,
  rel,
  target,
  onClick,
  demo = false,
  children,
}: LinkProps & Readonly<{ href: string; demo?: boolean }>) {
  return (
    <a
      href={href}
      rel={rel}
      target={target}
      onClick={onClick}
      data-demo-cta={demo ? '' : undefined}
      {...buttonLinkAttributes({ variant, box })}
    >
      {children}
    </a>
  );
}

export function DemoButtonLink({
  variant = 'primary',
  box,
  onClick,
  children,
}: Omit<LinkProps, 'rel' | 'target'>) {
  return (
    <ButtonLink
      href={DEMO_HREF}
      demo
      variant={variant}
      box={box}
      onClick={onClick}
      target={DEMO_EXTERNAL ? '_blank' : undefined}
      rel={DEMO_EXTERNAL ? 'noreferrer' : undefined}
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
