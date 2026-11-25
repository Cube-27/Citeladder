import type { ReactNode } from 'react';

import { Inline, Stack } from '@/components/ui/layout';
import { InfoHint } from '@/components/ui/info-hint';
import { slipClasses } from '@/components/ui/slip';
import { StateHeadingLevelContext } from '@/components/ui/state-heading-level';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export type WidgetLink = Readonly<{ href: string; label: string; name?: string }>;

export function WidgetFrame({
  id,
  title,
  description,
  status,
  link,
  chart = false,
  card = false,
  children,
}: Readonly<{
  id: string;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  link?: WidgetLink | null;
  chart?: boolean;
  card?: boolean;
  children: ReactNode;
}>) {
  return (
    <section
      aria-labelledby={id}
      data-overview-widget=""
      className="surface-tray flex h-full min-w-0 flex-col"
    >
      <WidgetHead id={id} title={title} description={description} status={status} link={link} />
      <Stack
        gap="item"
        className={cn(
          chart ? 'min-w-0 flex-1' : 'flex min-w-0 flex-1 flex-col [&>:last-child]:flex-1',
          card && slipClasses(),
        )}
      >
        <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
      </Stack>
    </section>
  );
}

function WidgetHead({
  id,
  title,
  description,
  status,
  link,
}: Readonly<{
  id: string;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  link?: WidgetLink | null;
}>) {
  return (
    <Inline as="header" className="min-h-9 items-center justify-between px-3 py-1.5">
      <Inline gap="item" className="min-w-0">
        <h2 id={id} className={textRole('label', 'text-ink-2 truncate')}>
          {title}
        </h2>
        {description ? (
          <InfoHint label={typeof title === 'string' ? `About ${title}` : 'About this card'}>
            {description}
          </InfoHint>
        ) : null}
      </Inline>
      {status || link ? (
        <Inline className={textRole('label', 'text-ink-2 shrink-0')}>
          {status}
          {link ? (
            <TextLink href={link.href} underline="hover">
              {link.name ? <span className="sr-only">{link.name}: </span> : null}
              {link.label}
            </TextLink>
          ) : null}
        </Inline>
      ) : null}
    </Inline>
  );
}
