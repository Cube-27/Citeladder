import type { ReactNode } from 'react';

import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { Icon } from '@/components/ui/icon';
import { Section } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { textRole } from '@/components/ui/typography';
import { CircleAlert, Info, TriangleAlert, type IconGlyph } from '@/lib/icons';

import { PageFrame } from './page-frame';

type NoticeTone = 'info' | 'warning' | 'negative' | 'loading';

const TONE: Readonly<
  Record<Exclude<NoticeTone, 'loading'>, readonly [glyph: IconGlyph, ink: string, word: string]>
> = {
  info: [Info, 'text-info', 'Notice'],
  warning: [TriangleAlert, 'text-warning', 'Warning'],
  negative: [CircleAlert, 'text-negative', 'Error'],
};

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
  const [glyph, ink, word] = TONE[tone];
  const mark = <Icon icon={icon ?? glyph} className={ink} />;
  return (
    <Section data-notice-tone={tone}>
      {label === null ? null : <p className={textRole('captionStrong')}>{label ?? word}</p>}
      {heading ? (
        <div className="flex items-start gap-2">
          <span className="flex h-7 items-center">{mark}</span>
          <h1 className={textRole('title', 'min-w-0 text-balance')}>{heading}</h1>
        </div>
      ) : null}
      {panels}
      {children ? (
        <div className="flex items-start gap-2">
          {heading ? null : mark}
          <div className={textRole('body', 'flex max-w-copy min-w-0 flex-col gap-2')}>
            {children}
          </div>
        </div>
      ) : null}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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
    <div className="pt-flow-gap flex min-w-0 flex-col">
      <NoticeBlock {...notice} />
    </div>
  );
}
