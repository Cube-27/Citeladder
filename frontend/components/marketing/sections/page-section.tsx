import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './page-section.css';

type HeadingTag = 'h1' | 'h2' | 'h3';

type SectionHeaderProps = Readonly<{
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  as?: HeadingTag;
  titleId?: string;
}>;

export function SectionHeader({
  title,
  lead,
  action,
  as: Heading = 'h2',
  titleId,
}: SectionHeaderProps) {
  return (
    <header className="cl-shead">
      <div className="cl-shead-main">
        <Heading id={titleId} className="cl-shead-title">
          {title}
        </Heading>
      </div>
      {(lead || action) && (
        <div className="cl-shead-side">
          {lead && <p className="cl-lead cl-shead-lead">{lead}</p>}
          {action}
        </div>
      )}
    </header>
  );
}

type PageSectionProps = Omit<SectionHeaderProps, 'title' | 'titleId'> &
  Readonly<{
    id?: string;
    title?: ReactNode;
    label?: string;
    labelHeading?: boolean;
    layout?: 'stack' | 'aside';
    aside?: ReactNode;
    split?: 'default' | 'even';
    measure?: 'full' | 'reading';
    spacing?: 'default' | 'compact';
    children?: ReactNode;
  }>;

export function PageSection({
  id,
  title,
  label,
  labelHeading,
  lead,
  action,
  layout,
  aside,
  split,
  measure,
  spacing,
  as,
  children,
}: PageSectionProps) {
  const titleId = useId();
  const isAside = layout === 'aside' || aside !== undefined;
  const head = sectionHead({ title, label, labelHeading, lead, action, as, titleId });
  return (
    <section
      id={id}
      aria-labelledby={head ? titleId : undefined}
      aria-label={head ? undefined : label}
      className={cn(
        'cl-section cl-page-section',
        isAside && 'cl-page-section--aside',
        spacing === 'compact' && 'cl-page-section--compact',
      )}
    >
      <div className="cl-container">
        <SectionLayout
          head={head}
          aside={isAside ? (aside ?? null) : undefined}
          split={split}
          body={
            children === undefined ? null : <SectionBody measure={measure}>{children}</SectionBody>
          }
        />
      </div>
    </section>
  );
}

function sectionHead({
  title,
  label,
  labelHeading,
  lead,
  action,
  as,
  titleId,
}: Readonly<{
  title?: ReactNode;
  label?: string;
  labelHeading?: boolean;
  lead?: ReactNode;
  action?: ReactNode;
  as?: HeadingTag;
  titleId: string;
}>): ReactNode {
  if (title !== undefined) {
    return <SectionHeader title={title} lead={lead} action={action} as={as} titleId={titleId} />;
  }
  if (label === undefined || !labelHeading) return null;
  return (
    <h2 id={titleId} className="sr-only">
      {label}
    </h2>
  );
}

function SectionBody({
  measure,
  children,
}: Readonly<{ measure?: 'full' | 'reading'; children: ReactNode }>) {
  return (
    <div
      className={cn(
        'cl-page-section-body',
        measure === 'reading' && 'cl-page-section-body--reading',
      )}
    >
      {children}
    </div>
  );
}

function SectionLayout({
  head,
  aside,
  split,
  body,
}: Readonly<{
  head: ReactNode;
  aside: ReactNode | undefined;
  split?: 'default' | 'even';
  body: ReactNode;
}>) {
  if (aside === undefined) {
    return (
      <>
        {head}
        {body}
      </>
    );
  }
  return (
    <div className={cn('cl-page-section-grid', split === 'even' && 'cl-page-section-grid--even')}>
      <div className="cl-page-section-aside">
        {head}
        {aside !== null && <div className="cl-page-section-aside-body">{aside}</div>}
      </div>
      {body}
    </div>
  );
}
