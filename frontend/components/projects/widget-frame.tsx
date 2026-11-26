import type { ReactNode } from 'react';

import { InfoHint } from '@/components/ui/info-hint';
import { Inline } from '@/components/ui/layout';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { TextLink } from '@/components/ui/text-link';

export type WidgetLink = Readonly<{ href: string; label: string; name?: string }>;

type WidgetFill = 'figure' | 'chart' | 'list';

export function WidgetFrame({
  id,
  title,
  description,
  status,
  link,
  fill = 'list',
  children,
}: Readonly<{
  id: string;
  title: ReactNode;
  description?: ReactNode;
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
  const headLink = figure ? null : linkElement;
  return (
    <Section aria-labelledby={id} data-overview-widget="">
      <SectionHeader
        actions={
          status || headLink ? (
            <>
              {status}
              {headLink}
            </>
          ) : undefined
        }
      >
        {figure ? (
          <Inline gap="item">
            <SectionTitle id={id}>{title}</SectionTitle>
            {description ? (
              <InfoHint label={typeof title === 'string' ? `About ${title}` : 'About this card'}>
                {description}
              </InfoHint>
            ) : null}
          </Inline>
        ) : (
          <>
            <SectionTitle id={id}>{title}</SectionTitle>
            {description ? <SectionDescription>{description}</SectionDescription> : null}
          </>
        )}
      </SectionHeader>
      {children}
      {figure && linkElement ? <SectionContent>{linkElement}</SectionContent> : null}
    </Section>
  );
}
