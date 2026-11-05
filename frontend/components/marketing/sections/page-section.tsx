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
  /** `center` for a section that stands alone (D18); `left` in an aside column beside content. */
  align?: 'left' | 'center';
  as?: HeadingTag;
  /** The heading's id, for the section it names. */
  titleId?: string;
}>;

/**
 * SectionHeader: an eyebrow, the section's display-xl title (36, 28 on
 * phones), its lead and one action, stacked so the copy always sits under its
 * heading. Every website section heads with this, so section titles never
 * vary in size page to page.
 */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  action,
  align = 'center',
  as: Heading = 'h2',
  titleId,
}: SectionHeaderProps) {
  return (
    <header className={cn('cl-shead', `cl-shead--${align}`)}>
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

type PageSectionProps = Omit<SectionHeaderProps, 'title' | 'align' | 'titleId'> &
  Readonly<{
    id?: string;
    title?: ReactNode;
    /** The landmark's name when the section has no title. */
    label?: string;
    /**
     * `aside` puts the left-aligned header (and `aside` content) in a sticky
     * 4/12 column, for long-form and utility pages; landing pages stack (D18).
     */
    layout?: 'stack' | 'aside';
    aside?: ReactNode;
    /** `reading` holds the body to the 720 reading measure, centred, for FAQs and lists. */
    measure?: 'full' | 'reading';
    /** `compact` is the one tighter rhythm (64, 48 under 1024), for strips. */
    spacing?: 'default' | 'compact';
    children?: ReactNode;
  }>;

/**
 * PageSection: one band of a website page, 128px above (96 under 1024), the
 * centred header 48px over its content, inside the 1320 container. Pages
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
        align={isAside ? 'left' : 'center'}
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
          <div className="cl-page-section-grid">
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
