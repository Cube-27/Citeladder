import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Eyebrow } from './site-parts';

type HeadingTag = 'h1' | 'h2' | 'h3';

type SectionHeaderProps = Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** One action under the lead (an ArrowLink or a button). */
  action?: ReactNode;
  /** `center` for a section that stands alone; `left` beside content. */
  align?: 'left' | 'center';
  /** `split` puts the lead and action beside the title (left alignment only). */
  layout?: 'stack' | 'split';
  as?: HeadingTag;
}>;

/**
 * SectionHeader: an eyebrow, the section's display-xl title (36, 28 on
 * phones) and its lead. Every website section heads with this, so section
 * titles never vary in size page to page.
 */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  action,
  align = 'left',
  layout = 'stack',
  as: Heading = 'h2',
}: SectionHeaderProps) {
  const split = align === 'left' && layout === 'split';
  return (
    <header className={cn('cl-shead', `cl-shead--${align}`, split && 'cl-shead--split')}>
      <div className="cl-shead-main">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading className="cl-shead-title">{title}</Heading>
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

type PageSectionProps = Omit<SectionHeaderProps, 'title' | 'layout'> &
  Readonly<{
    id?: string;
    title?: ReactNode;
    /** The landmark's name when the section has no title. */
    label?: string;
    headerLayout?: 'stack' | 'split';
    /** `aside` puts the header (and `aside` content) in a sticky 4/12 column. */
    layout?: 'stack' | 'aside';
    aside?: ReactNode;
    /** `compact` is the one tighter rhythm (64, 48 under 1024), for strips. */
    spacing?: 'default' | 'compact';
    children?: ReactNode;
  }>;

/**
 * PageSection: one band of a website page, 128px above (96 under 1024), the
 * header 48px over its content, inside the 1320 container. Pages compose
 * sections and never set spacing themselves.
 */
export function PageSection({
  id,
  title,
  label,
  eyebrow,
  lead,
  action,
  align,
  headerLayout,
  layout = 'stack',
  aside,
  spacing = 'default',
  as,
  children,
}: PageSectionProps) {
  const isAside = layout === 'aside' || aside !== undefined;
  const head =
    title === undefined ? null : (
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        lead={lead}
        action={action}
        align={isAside ? 'left' : align}
        layout={isAside ? 'stack' : headerLayout}
        as={as}
      />
    );
  const body =
    children === undefined ? null : <div className="cl-page-section-body">{children}</div>;
  return (
    <section
      id={id}
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
