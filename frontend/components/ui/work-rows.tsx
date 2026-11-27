import type { ReactNode } from 'react';

import { Pressable } from '@/components/ui/pressable';
import { SectionBleed, useOnPage } from '@/components/ui/section';
import { TextLink } from '@/components/ui/text-link';

import { cn } from '@/lib/utils';

const GRID =
  'grid grid-cols-work-row phone:grid-cols-work-row-phone desktop:grid-cols-work-row-wide items-center gap-3 phone:gap-2';
const WIDE = 'hidden desktop:block';
const PAD = 'px-4 phone:px-3';

export function WorkRows({
  label,
  heads,
  children,
  more,
}: Readonly<{
  label: string;
  heads: readonly [string, string, string, string];
  children: ReactNode;
  more?: ReactNode;
}>) {
  const [title, scope, impact, source] = heads;
  const onPage = useOnPage();
  const body = (
    <>
      <table aria-label={label} className="block w-full">
        <thead className="block">
          <tr
            className={cn(
              GRID,
              onPage && cn(PAD, 'bg-well'),
              'text-caption-strong text-ink-2 border-rule h-8 border-b',
            )}
          >
            <th aria-label="Select" />
            <th className="text-left">{title}</th>
            <th className={cn(WIDE, 'text-left')}>{scope}</th>
            <th className="text-left">{impact}</th>
            <th className={cn(WIDE, 'text-left')}>{source}</th>
          </tr>
        </thead>
        <tbody className="block">{children}</tbody>
      </table>
      {more}
    </>
  );
  return onPage ? <SectionBleed>{body}</SectionBleed> : <div className="min-w-0">{body}</div>;
}

export function WorkRow({
  tick,
  href,
  title,
  caption,
  scope,
  impact,
  source,
}: Readonly<{
  tick: ReactNode;
  href: string;
  title: string;
  caption: string;
  scope: string;
  impact: ReactNode;
  source: string;
}>) {
  const onPage = useOnPage();
  return (
    <tr
      className={cn(
        GRID,
        onPage && PAD,
        'border-rule hover:overlay-hover relative min-h-10 not-first:border-t',
      )}
    >
      <td className="z-raised relative flex">{tick}</td>
      <td className="flex min-w-0 items-baseline gap-2">
        <TextLink href={href} text="body" underline="hover" truncate box="cover">
          {title}
        </TextLink>
        <span className="text-body text-ink-2 phone:hidden min-w-0 flex-1 truncate">{caption}</span>
      </td>
      <td className={cn(WIDE, 'text-body text-ink-2 truncate tabular-nums')}>{scope}</td>
      <td className="text-body text-ink flex">{impact}</td>
      <td className={cn(WIDE, 'text-body text-ink-2 truncate')}>{source}</td>
    </tr>
  );
}

export function WorkRowsMore({
  onClick,
  disabled,
  children,
}: Readonly<{ onClick: () => void; disabled: boolean; children: string }>) {
  return (
    <Pressable
      data-tree-row=""
      onClick={onClick}
      disabled={disabled}
      text="body"
      numeric
      look="more"
      tone="ink-2"
    >
      {children}
    </Pressable>
  );
}
