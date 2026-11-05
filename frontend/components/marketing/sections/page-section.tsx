import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Eyebrow } from './site-parts';

type HeadingTag = 'h1' | 'h2' | 'h3';

type SectionHeaderProps = Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** One action under the lead (an ArrowLink, a button or a short note). */
  action?: ReactNode;
  as?: HeadingTag;
  /** The heading's id, for the section it names. */
  titleId?: string;
}>;

/**
 * SectionHeader: an eyebrow, the section's title (44, 28 on phones), its lead
 * and one action, stacked and left-aligned so the copy always sits under its
 * heading (D33). Every website section heads with this, so section titles
 * never vary in size page to page.
 */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  action,
  as: Heading = 'h2',
  titleId,
}: SectionHeaderProps) {
  return (
    <header className="cl-shead">
      <div className="cl-shead-main">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
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
  eyebrow,
  lead,
  action,
  layout = 'stack',
  aside,
  split = 'default',
  measure = 'full',
  spacing = 'default',
  as,
  children,
}: PageSectionProps) {
  const titleId = useId();
  const isAside = layout === 'aside' || aside !== undefined;
  const head =
    title === undefined ? null : (
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        lead={lead}
        action={action}
        as={as}
        titleId={titleId}
      />
    );
  const body =
    children === undefined ? null : (
      <div
        className={cn(
          'cl-page-section-body',
          measure === 'reading' && 'cl-page-section-body--reading',
        )}
      >
        {children}
      </div>
    );
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
        {isAside ? (
          <div
            className={cn('cl-page-section-grid', split === 'even' && 'cl-page-section-grid--even')}
          >
            <div className="cl-page-section-aside">
              {head}
              {aside !== undefined && <div className="cl-page-section-aside-body">{aside}</div>}
            </div>
            {body}
          </div>
        ) : (
          <>
            {head}
            {body}
          </>
        )}
      </div>
    </section>
  );
}
