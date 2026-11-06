import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type HeadingTag = 'h1' | 'h2' | 'h3';

type SectionHeaderProps = Readonly<{
  title: ReactNode;
  lead?: ReactNode;
  /** One action under the lead (an ArrowLink, a button or a short note). */
  action?: ReactNode;
  as?: HeadingTag;
  /** The heading's id, for the section it names. */
  titleId?: string;
}>;

/**
 * SectionHeader: the section's title (56, 28 on phones), its lead and one
 * action, stacked and left-aligned so the copy always sits under its heading
 * (D33). Every website section heads with this, so section titles never vary
 * in size page to page. No eyebrow: the heading says what the section is (D36).
 */
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
    /** The landmark's name when the section has no title. */
    label?: string;
    /**
     * With `label`: the label is also the section's h2, visually hidden, so
     * the card titles (h3) under it keep the page's heading order (D36).
     */
    labelHeading?: boolean;
    /**
     * `aside` puts the header (and `aside` content) in a sticky 4/12 column
     * beside the body, for FAQs, long-form and utility pages (D33).
     */
    layout?: 'stack' | 'aside';
    aside?: ReactNode;
    /** `even` gives the aside and the body equal halves, for a form beside its explanation. */
    split?: 'default' | 'even';
    /** `reading` holds the body to the 720 reading measure, for lists. */
    measure?: 'full' | 'reading';
    /** `compact` is the one tighter rhythm (64, 48 under 1024), for strips. */
    spacing?: 'default' | 'compact';
    children?: ReactNode;
  }>;

/**
 * PageSection: one band of a website page, 128px above (96 under 1024), the
 * left-aligned header 48px over its content, inside the 1320 container. Pages
 * compose sections and never set spacing themselves.
 */
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
      // A titled section is named by its heading; an untitled one by `label`.
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

/** The visible header, a visually hidden h2 for a `labelHeading` section, or none. */
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

/** The header over the body, or (with an `aside`, null for none) in a sticky column beside it. */
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
