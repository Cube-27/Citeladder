import type { MouseEventHandler, ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { SectionBleed } from '@/components/ui/section';
import { ChevronRight } from '@/lib/icons';
import { cn } from '@/lib/utils';

export function LinkRows({
  label,
  ticked = false,
  children,
  more,
}: Readonly<{ label: string; ticked?: boolean; children: ReactNode; more?: ReactNode }>) {
  return (
    <SectionBleed>
      <ul
        aria-label={label}
        className={cn(
          'divide-rule grid gap-x-3 divide-y',
          ticked
            ? 'grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]'
            : 'grid-cols-[minmax(0,1fr)_auto_auto_auto]',
        )}
      >
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
    <li className="hover:overlay-hover px-panel-inset min-h-row relative col-span-full grid grid-cols-subgrid items-center">
      {tick ? <span className="z-raised relative flex">{tick}</span> : null}
      <ProjectLink href={href} onClick={onClick} look="list-row">
        {name}
      </ProjectLink>
      <span className="text-caption text-ink-2 whitespace-nowrap">
        <span className="phone:hidden">{facts[0]}</span>
      </span>
      <span className="text-caption text-ink-2 flex whitespace-nowrap tabular-nums">
        {facts[1]}
      </span>
      <Icon icon={ChevronRight} tone="ink-2" />
    </li>
  );
}
