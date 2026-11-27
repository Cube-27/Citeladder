import type { ReactNode } from 'react';

import { Pressable } from '@/components/ui/pressable';
import { SectionBleed, useOnPage } from '@/components/ui/section';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/text-role';
import { cn } from '@/lib/utils';

const GRID =
  'grid grid-cols-[20px_1fr_120px] phone:grid-cols-[20px_1fr_88px] desktop:grid-cols-[20px_1fr_92px_120px_110px] items-center gap-3 phone:gap-2';
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
              textRole('captionStrong', 'text-ink-2 border-rule h-8 border-b'),
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
        <TextLink
          href={href}
          text="body"
          underline="hover"
          className="phone:flex-1 min-w-0 shrink truncate before:absolute before:inset-x-0 before:inset-y-0"
        >
          {title}
        </TextLink>
        <span className={textRole('body', 'text-ink-2 phone:hidden min-w-0 flex-1 truncate')}>
          {caption}
        </span>
      </td>
      <td className={cn(WIDE, textRole('body', 'text-ink-2 truncate tabular-nums'))}>{scope}</td>
      <td className={textRole('body', 'flex')}>{impact}</td>
      <td className={cn(WIDE, textRole('body', 'text-ink-2 truncate'))}>{source}</td>
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
      className={textRole(
        'body',
        'border-rule text-ink-2 hover:overlay-hover hover:text-ink flex h-10 items-center justify-center border-t tabular-nums',
      )}
    >
      {children}
    </Pressable>
  );
}
