import type { ReactNode } from 'react';
import { ArrowRight } from '@/lib/icons';

import './announcement-pill.css';

export function AnnouncementPill({
  href,
  tag,
  children,
}: Readonly<{ href?: string; tag?: string; children: ReactNode }>) {
  const content = (
    <>
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
