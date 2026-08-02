import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * The one card on the public surface (docs/website-design-system.md §5.3).
 *
 * Before this existed every page hand-rolled its own: three radii, four
 * paddings and two different hover treatments across a single three-up. The
 * card is a token decision, so it lives here and nothing else may re-decide it.
 *
 * Radii step DOWN when nested — a `feature` card is 30px and holds 20px
 * children; a `base` card is 20px and holds 12px children. Never a 20px radius
 * inside a 20px radius.
 */
const SIZE = {
  /** Standard card: 20px radius, 30px padding. */
  base: 'rounded-mkt-lg p-mkt-30',
  /** Large feature card: 30px radius, 50px padding. */
  feature: 'rounded-mkt-xl p-mkt-50',
} as const;

const TONE = {
  /** On a white section. */
  surface: 'bg-mkt-surface',
  /** On a white section, when the card needs to separate by fill. */
  sunken: 'bg-mkt-surface-sunk',
} as const;

type CardVisualProps = Readonly<{
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
  /** Adds the hover lift. Set automatically by CardLink. */
  interactive?: boolean;
  className?: string;
}>;

type CardProps = CardVisualProps & Readonly<{ children: ReactNode }>;

function cardClasses({ size = 'base', tone = 'surface', interactive, className }: CardVisualProps) {
  return cn(
    'gap-mkt-20 border-mkt-black-10 shadow-mkt-card flex flex-col border',
    SIZE[size],
    TONE[tone],
    // Hover: lift 4px, deepen the shadow one step, border → Mist Blue. Two
    // properties plus the transform, no scale, on the 0.4s micro tween.
    interactive &&
      'duration-mkt-micro ease-mkt-micro transition-[box-shadow,border-color,transform] ' +
        '[@media(hover:hover)_and_(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:hover:-translate-y-1 ' +
        'hover:shadow-mkt-nav hover:border-mkt-mist',
    className,
  );
}

export function Card({ children, ...rest }: CardProps) {
  return <div className={cardClasses(rest)}>{children}</div>;
}

/**
 * The clickable card. Internal hrefs route through next/link.
 *
 * `interactive` is omitted from the public type: this card always sets it, and
 * a caller that passed it would land in `...rest` and be spread onto the
 * anchor as an unknown DOM attribute.
 */
export function CardLink({
  href,
  children,
  size,
  tone,
  className,
  ...rest
}: Omit<CardProps, 'interactive'> & { href: string } & Omit<
    ComponentPropsWithoutRef<'a'>,
    'href' | 'className' | 'children'
  >) {
  const props = {
    className: cardClasses({ size, tone, interactive: true, className }),
    ...rest,
  };
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

/**
 * The card's icon container: a 48px frost circle with an accent glyph. Owns its
 * icon size so a call site that forgets does not fall back to lucide's 24px
 * default.
 */
export function CardIcon({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="mkt-icon-circle [&_svg]:size-5 [&_svg]:shrink-0">{children}</span>;
}

/** Card title — the compact `Heading SM` rung, the one card-heading step. */
export function CardTitle({
  children,
  as: Heading = 'h3',
  className,
}: Readonly<{ children: ReactNode; as?: 'h2' | 'h3' | 'h4'; className?: string }>) {
  return (
    <Heading className={cn('font-mkt-display text-mkt-hsm text-mkt-ink', className)}>
      {children}
    </Heading>
  );
}

/** Card body copy — Text SM in slate. */
export function CardBody({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return <p className={cn('text-mkt-sm text-mkt-ink-soft', className)}>{children}</p>;
}

/**
 * The card grid: 3 columns desktop → 2 tablet → 1 mobile, at the 30px both-axis
 * gap. Uses a minimum column width so it reflows naturally rather than snapping
 * on a hard column count.
 */
export function CardGrid({
  children,
  columns = 3,
  className,
}: Readonly<{ children: ReactNode; columns?: 2 | 3 | 4; className?: string }>) {
  const COLUMNS = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  } as const;
  return (
    <div className={cn('gap-mkt-30 grid grid-cols-1', COLUMNS[columns], className)}>{children}</div>
  );
}
