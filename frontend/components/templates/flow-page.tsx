import { useId, type ReactNode } from 'react';

import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { FlowBar, FlowFooter } from '@/components/ui/flow-chrome';
import { FlowMain, PageGround } from '@/components/ui/flow-frame';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { Section } from '@/components/ui/section';
import { Text } from '@/components/ui/typography';
import type { IconGlyph } from '@/lib/icons';

export function FlowPage({
  label,
  kicker = label,
  barEnd,
  footer,
  aside,
  children,
}: Readonly<{
  label: string;
  kicker?: string | null;
  barEnd?: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <PageGround layout="grid" split={Boolean(aside)}>
      <div className="flex min-h-dvh min-w-0 flex-col">
        <FlowBar end={barEnd} />
        <FlowMain id="main" aria-label={label} variant="page">
          {aside ? (
            <Stack gap="loose">
              <FlowCardBody kicker={kicker}>{children}</FlowCardBody>
            </Stack>
          ) : (
            <Section>
              <FlowCardBody kicker={kicker}>{children}</FlowCardBody>
            </Section>
          )}
        </FlowMain>
        {footer ? <FlowFooter>{footer}</FlowFooter> : null}
      </div>
      {aside}
    </PageGround>
  );
}

function FlowCardBody({
  kicker,
  children,
}: Readonly<{ kicker: string | null; children: ReactNode }>) {
  return (
    <>
      {kicker === null ? null : (
        <Text as="p" variant="caption-strong">
          {kicker}
        </Text>
      )}
      <div className="flex flex-col">{children}</div>
    </>
  );
}

export function FlowHead({
  id,
  title,
  sub,
  icon,
  centered,
}: Readonly<{
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  icon?: IconGlyph;
  centered?: boolean;
}>) {
  useDocumentTitle(typeof title === 'string' ? title : undefined);
  return (
    <Stack as="header" gap="item" align={centered ? 'center' : 'stretch'}>
      {icon ? <Icon icon={icon} tone="ink-2" /> : null}
      <Text
        as="h1"
        variant="title"
        wrap="balance"
        align={centered ? 'center' : 'start'}
        id={id}
        tabIndex={-1}
      >
        {title}
      </Text>
      {sub ? (
        <Text as="p" variant="body" tone="ink-2" align={centered ? 'center' : 'start'}>
          {sub}
        </Text>
      ) : null}
    </Stack>
  );
}

export function FlowBlock({
  title,
  titleId,
  sub,
  icon,
  centered,
  after,
  children,
}: Readonly<{
  title: ReactNode;
  titleId?: string;
  sub?: ReactNode;
  icon?: IconGlyph;
  centered?: boolean;
  after?: ReactNode;
  children?: ReactNode;
}>) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  return (
    <Stack gap="page-top">
      <Stack as="section" gap="page-top" aria-labelledby={headingId}>
        <FlowHead id={headingId} title={title} sub={sub} icon={icon} centered={centered} />
        {children}
      </Stack>
      {after ? <Stack gap="loose">{after}</Stack> : null}
    </Stack>
  );
}
