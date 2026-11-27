import { useId, type ReactNode } from 'react';

import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { Icon } from '@/components/ui/icon';
import { FlowLogo } from '@/components/ui/flow-logo';
import { Section } from '@/components/ui/section';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { textRole } from '@/components/ui/text-role';
import type { IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

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
    <div
      className={cn(
        'text-ink grid min-h-dvh antialiased',
        aside ? 'bg-panel desktop:grid-cols-2' : 'bg-ground',
      )}
    >
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="min-h-masthead gap-card px-gutter flex shrink-0 items-center justify-between">
          <span className="inline-flex">
            <FlowLogo />
          </span>
          <div className="flex items-center gap-2">
            {barEnd}
            <ThemeSwitch />
          </div>
        </header>
        <main
          id="main"
          aria-label={label}
          className="max-w-flow px-gutter pb-flow-gap mx-auto flex w-full flex-1 flex-col pt-[max(var(--spacing-flow-gap),calc(20dvh-var(--spacing-masthead)))] [--spacing-control-md:var(--spacing-control-lg)]"
        >
          {aside ? (
            <div className="flex flex-col gap-4">
              <FlowCardBody kicker={kicker}>{children}</FlowCardBody>
            </div>
          ) : (
            <Section>
              <FlowCardBody kicker={kicker}>{children}</FlowCardBody>
            </Section>
          )}
        </main>
        {footer ? (
          <footer className={textRole('caption', 'px-gutter py-4 text-center')}>{footer}</footer>
        ) : null}
      </div>
      {aside}
    </div>
  );
}

function FlowCardBody({
  kicker,
  children,
}: Readonly<{ kicker: string | null; children: ReactNode }>) {
  return (
    <>
      {kicker === null ? null : <p className={textRole('captionStrong')}>{kicker}</p>}
      <div className="flex flex-col">{children}</div>
    </>
  );
}

function FlowHead({
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
    <header className={cn('flex flex-col gap-2', centered && 'items-center text-center')}>
      {icon ? <Icon icon={icon} className="text-ink-2" /> : null}
      <h1 id={id} tabIndex={-1} className={textRole('title', 'text-balance')}>
        {title}
      </h1>
      {sub ? <p className={textRole('body', 'text-ink-2')}>{sub}</p> : null}
    </header>
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
    <div className="gap-page-top flex flex-col">
      <section aria-labelledby={headingId} className="gap-page-top flex flex-col">
        <FlowHead id={headingId} title={title} sub={sub} icon={icon} centered={centered} />
        {children}
      </section>
      {after ? (
        <div className={textRole('body', 'flex flex-col gap-4 text-ink-2')}>{after}</div>
      ) : null}
    </div>
  );
}
