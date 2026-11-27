import type { MouseEventHandler, ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { SectionBleed } from '@/components/ui/section';
import { ChevronRight } from '@/lib/icons';

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
      {tick ? <span className="z-raised relative flex shrink-0">{tick}</span> : null}
      <ProjectLink href={href} onClick={onClick} look="list-row">
        {name}
      </ProjectLink>
      <span className="text-caption text-ink-2 phone:hidden w-24 shrink-0 truncate">
        {facts[0]}
      </span>
      <span className="text-caption text-ink-2 flex w-24 shrink-0 truncate tabular-nums">
        {facts[1]}
      </span>
      <Icon icon={ChevronRight} tone="ink-2" />
    </li>
  );
}
