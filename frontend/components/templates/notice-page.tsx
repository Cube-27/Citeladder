import type { ReactNode } from 'react';

import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { Icon, TitleMark } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { Section } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { CopyStack, Text } from '@/components/ui/typography';
import { NOTICE_TONE } from '@/components/ui/notice';
import type { IconGlyph } from '@/lib/icons';

import { PageFrame } from './page-frame';

type NoticeTone = 'info' | 'warning' | 'negative' | 'loading';

const PAGE_LABEL: Partial<Record<NoticeTone, string>> = { info: 'Notice' };

type NoticeContent = Readonly<{
  tone: NoticeTone;
  heading: string;
  icon?: IconGlyph;
  label?: string | null;
  children?: ReactNode;
  panels?: ReactNode;
  actions?: ReactNode;
}>;

function NoticeBlock({
  tone,
  heading,
  icon,
  label,
  children,
  panels,
  actions,
}: Omit<NoticeContent, 'heading'> & Readonly<{ heading: string | null }>) {
  if (tone === 'loading')
    return <StateBlock kind="loading" label={heading ?? undefined} shape={{ kind: 'list' }} />;
  const { glyph, tone: ink, word } = NOTICE_TONE[tone];
  const mark = <Icon icon={icon ?? glyph} tone={ink} />;
  return (
    <Section data-notice-tone={tone}>
      {label === null ? null : (
        <Text as="p" variant="caption-strong">
          {label ?? PAGE_LABEL[tone] ?? word}
        </Text>
      )}
      {heading ? (
        <Inline align="start">
          <TitleMark>{mark}</TitleMark>
          <Text as="h1" variant="title" box="shrink" wrap="balance">
            {heading}
          </Text>
        </Inline>
      ) : null}
      {panels}
      {children ? (
        <Inline align="start">
          {heading ? null : mark}
          <CopyStack>{children}</CopyStack>
        </Inline>
      ) : null}
      {actions ? <Inline wrap>{actions}</Inline> : null}
    </Section>
  );
}

export function NoticePage({ heading, ...notice }: NoticeContent) {
  const loading = notice.tone === 'loading';
  return (
    <PageFrame title={loading ? undefined : heading}>
      <NoticeBlock {...notice} heading={loading ? heading : null} />
    </PageFrame>
  );
}

export function NoticeScreen(notice: NoticeContent) {
  useDocumentTitle(notice.tone === 'loading' ? undefined : notice.heading);
  return (
    <Stack gap="none" pad={{ top: 'flow-gap' }} box="shrink">
      <NoticeBlock {...notice} />
    </Stack>
  );
}
