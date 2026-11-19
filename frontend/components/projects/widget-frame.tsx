import type { ReactNode } from 'react';

import { Inline, Stack } from '@/components/ui/layout';
import { InfoHint } from '@/components/ui/info-hint';
import { SectionDescription } from '@/components/ui/section';
import { StateHeadingLevelContext } from '@/components/ui/state-block';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';

/** Where a widget's head link goes; every widget words and draws it alike. */
export type WidgetLink = Readonly<{ href: string; label: string; name?: string }>;

/**
 * How the body fills the card's height when a taller neighbour stretches it:
 * a `figure` sits under the head with its link at the card's foot, a `chart`
 * stretches its plot into the height, and a `list` starts at the head.
 */
type WidgetFill = 'figure' | 'chart' | 'list';

type WidgetHeadProps = Readonly<{
  id: string;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  link: ReactNode;
  figure: boolean;
}>;

/**
 * One Overview widget, unboxed on the surface (owner, 2026-11-19: the page's
 * section rules separate widgets): one head (its title in `heading` at the
 * left, its status or link at the right), then a figure, a chart or a short
 * list. A `figure` widget keeps its description in a hint after the title, so
 * it is the head and one figure. Widgets in a row share a height.
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
  const linkElement = link ? (
    <TextLink href={link.href} underline="hover">
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
      className="flex h-full min-w-0 flex-col"
    >
      <WidgetHead
        id={id}
        title={title}
        description={description}
        status={status}
        link={figure ? null : linkElement}
        figure={figure}
      />
      {/* A chart's grid body stretches its one child; a figure or list starts at the head. */}
      <Stack
        gap="item"
        className={fill === 'chart' ? 'min-w-0 flex-1' : 'flex min-w-0 flex-1 flex-col'}
      >
        <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
      </Stack>
      {figure && linkElement ? <Inline>{linkElement}</Inline> : null}
    </Stack>
  );
}

function WidgetHead({ id, title, description, status, link, figure }: WidgetHeadProps) {
  const heading = (
    <h2 id={id} className={textRole('heading', 'truncate')}>
      {title}
    </h2>
  );
  return (
    <Inline as="header" className="items-start justify-between">
      {figure ? (
        <Inline gap="item" className="min-w-0">
          {heading}
          {description ? (
            <InfoHint label={typeof title === 'string' ? `About ${title}` : 'About this card'}>
              {description}
            </InfoHint>
          ) : null}
        </Inline>
      ) : (
        <Stack gap="tight" className="min-w-0">
          {heading}
          {description ? <SectionDescription>{description}</SectionDescription> : null}
        </Stack>
      )}
      {status || link ? (
        <Inline className="shrink-0">
          {status}
          {link}
        </Inline>
      ) : null}
    </Inline>
  );
}
