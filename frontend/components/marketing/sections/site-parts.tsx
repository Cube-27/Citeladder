import type { ReactNode } from 'react';

import { ArrowRight } from '@/lib/icons';
import { DEMO_EXTERNAL } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

export function SiteArrowLink({
  href,
  children,
  inCard = false,
  demo = false,
}: Readonly<{
  href?: string;
  children: ReactNode;
  inCard?: boolean;
  demo?: boolean;
}>) {
  const content = (
    <>
      <span className="cl-arrowlink-text">{children}</span>
      <ArrowRight aria-hidden className="cl-arrowlink-icon" />
    </>
  );
  if (!href)
    return <span className={cn('cl-arrowlink', inCard && 'cl-fcard-more')}>{content}</span>;
  return (
    <a
      href={href}
      className={cn('cl-arrowlink focus-ring', inCard && 'cl-fcard-more')}
      data-demo-cta={demo ? '' : undefined}
      {...(demo && DEMO_EXTERNAL ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {content}
    </a>
  );
}

export function Eyebrow({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="cl-kicker cl-eyebrow">{children}</p>;
}

export function CheckList({
  items,
  small = false,
}: Readonly<{ items: readonly string[]; small?: boolean }>) {
  return (
    <ul className={cn('cl-checks', small && 'cl-checks--sm')}>
      {items.map((item) => (
        <li key={item}>
          <span aria-hidden className="cl-checks-mark" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function columnsFor(count: number): 1 | 2 | 3 | 4 {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  if (count === 4) return 4;
  return count % 4 === 0 ? 4 : 3;
}
