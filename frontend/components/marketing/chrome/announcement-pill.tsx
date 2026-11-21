import type { ReactNode } from 'react';
import { ArrowRight } from '@/lib/icons';

import './announcement-pill.css';

/**
 * AnnouncementPill: one line of news above the landing hero, with an
 * optional tag. With an `href` the whole pill is the link.
 */
export function AnnouncementPill({
  href,
  tag,
  children,
}: Readonly<{ href?: string; tag?: string; children: ReactNode }>) {
  const content = (
    <>
      {/* The space keeps the tag and the message two words for screen readers. */}
      {tag && <span className="cl-announce-tag">{tag}</span>}{' '}
      <span className="cl-announce-text">{children}</span>
      {href && <ArrowRight aria-hidden className="size-3.5 shrink-0" />}
    </>
  );
  if (!href) return <span className="cl-announce">{content}</span>;
  return (
    <a href={href} className="cl-announce focus-ring">
      {content}
    </a>
  );
}
