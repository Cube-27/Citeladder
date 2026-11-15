import type { ReactNode } from 'react';

import { SectionDescription } from '@/components/ui/section';
import { slipClasses } from '@/components/ui/slip';
import { StateHeadingLevelContext } from '@/components/ui/state-block';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/** Where a widget's head link goes; every widget words and draws it alike. */
export type WidgetLink = Readonly<{ href: string; label: string; name?: string }>;

/**
 * How the body fills the card's height (direction 2.3): a `figure` widget
 * centres its number, a `list` or `chart` starts at the head and grows.
 */
type WidgetFill = 'figure' | 'list';

/**
 * One Overview widget: a card with one head (its title in `subheading` at the
 * left, its status or link at the right), then a figure, a chart or a short
 * list. Widgets in a row share a height; the body fills it.
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
  return (
    <section
      aria-labelledby={id}
      data-overview-widget=""
      className={slipClasses('flex h-full min-w-0 flex-col gap-4')}
    >
      <header className="flex min-w-0 items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <h2 id={id} className={textRole('subheading', 'truncate')}>
            {title}
          </h2>
          {description ? <SectionDescription>{description}</SectionDescription> : null}
        </div>
        {status || link ? (
          <div className="flex shrink-0 items-center gap-2">
            {status}
            {link ? (
              <TextLink href={link.href}>
                {link.name ? <span className="sr-only">{link.name}: </span> : null}
                {link.label}
              </TextLink>
            ) : null}
          </div>
        ) : null}
      </header>
      <div
        className={cn('flex min-w-0 flex-1 flex-col gap-2', fill === 'figure' && 'justify-center')}
      >
        <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
      </div>
    </section>
  );
}
