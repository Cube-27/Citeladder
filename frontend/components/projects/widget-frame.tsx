import type { ReactNode } from 'react';

import { Inline, Stack } from '@/components/ui/layout';
import { InfoHint } from '@/components/ui/info-hint';
import { SectionDescription } from '@/components/ui/section';
import { slipClasses } from '@/components/ui/slip';
import { StateHeadingLevelContext } from '@/components/ui/state-block';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/** Where a widget's head link goes; every widget words and draws it alike. */
export type WidgetLink = Readonly<{ href: string; label: string; name?: string }>;

/**
 * How the body fills the card's height when a taller neighbour stretches it:
 * a `figure` sits under the head with its link at the card's foot, a `chart`
 * grows its plot into the height, and a `list` starts at the head.
 */
type WidgetFill = 'figure' | 'chart' | 'list';

/**
 * One Overview widget: a card with one head (its title in `heading` at the
 * left, its status or link at the right), then a figure, a chart or a short
 * list. A `figure` widget keeps its description in a hint after the title, so
 * its card is the head and one figure. Widgets in a row share a height.
 */
export function WidgetFrame({
  id,
  title,
  description,
  status,
  link,
  fill = 'list',
  children,
}: Readonly<{
  /** The heading's id, which names the region. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** A StatusMark at the head's end. */
  status?: ReactNode;
  link?: WidgetLink | null;
  fill?: WidgetFill;
  children: ReactNode;
}>) {
  const figure = fill === 'figure';
  const headLink = figure ? null : link;
  const linkElement = link ? (
    <TextLink href={link.href}>
      {link.name ? <span className="sr-only">{link.name}: </span> : null}
      {link.label}
    </TextLink>
  ) : null;
  return (
    <Stack
      as="section"
      gap="workspace"
      aria-labelledby={id}
      data-overview-widget=""
      className={slipClasses('flex h-full min-w-0 flex-col')}
    >
      <Inline as="header" className="items-start justify-between">
        {figure ? (
          <Inline gap="item" className="min-w-0">
            <h2 id={id} className={textRole('heading', 'truncate')}>
              {title}
            </h2>
            {description ? (
              <InfoHint label={typeof title === 'string' ? `About ${title}` : 'About this card'}>
                {description}
              </InfoHint>
            ) : null}
          </Inline>
        ) : (
          <Stack gap="tight" className="min-w-0">
            <h2 id={id} className={textRole('heading', 'truncate')}>
              {title}
            </h2>
            {description ? <SectionDescription>{description}</SectionDescription> : null}
          </Stack>
        )}
        {status || headLink ? (
          <Inline className="shrink-0">
            {status}
            {headLink ? linkElement : null}
          </Inline>
        ) : null}
      </Inline>
      <Stack
        gap="item"
        className={cn(
          'flex min-w-0 flex-col',
          !figure && 'flex-1',
          // The plot takes the height a taller neighbour gives the row.
          fill === 'chart' && '*:flex-1',
        )}
      >
        <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
      </Stack>
      {figure && link ? <Inline className="mt-auto">{linkElement}</Inline> : null}
    </Stack>
  );
}
