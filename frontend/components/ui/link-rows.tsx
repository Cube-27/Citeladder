import type { MouseEventHandler, ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { SectionBleed } from '@/components/ui/section';
import { textRole } from '@/components/ui/typography';
import { ChevronRight } from '@/lib/icons';
import { cn } from '@/lib/utils';

const FACT = 'w-24 shrink-0 truncate';

export function LinkRows({
  label,
  children,
  more,
}: Readonly<{ label: string; children: ReactNode; more?: ReactNode }>) {
  return (
    <SectionBleed>
      <ul aria-label={label} className="divide-rule divide-y">
        {children}
      </ul>
      {more}
    </SectionBleed>
  );
}

export function LinkRow({
  tick,
  href,
  onClick,
  name,
  facts,
}: Readonly<{
  tick?: ReactNode;
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  name: ReactNode;
  facts: readonly [ReactNode, ReactNode];
}>) {
  return (
    <li className="hover:overlay-hover px-panel-inset relative flex h-10 items-center gap-3">
      {tick ? <span className="relative z-10 flex shrink-0">{tick}</span> : null}
      <ProjectLink
        href={href}
        onClick={onClick}
        className="focus-ring rounded-mark min-w-0 flex-1 truncate before:absolute before:inset-x-0 before:inset-y-0"
      >
        {name}
      </ProjectLink>
      <span className={textRole('caption', cn('text-ink-2 phone:hidden', FACT))}>{facts[0]}</span>
      <span className={textRole('caption', cn('text-ink-2 flex tabular-nums', FACT))}>
        {facts[1]}
      </span>
      <Icon icon={ChevronRight} className="text-ink-2 shrink-0" />
    </li>
  );
}
