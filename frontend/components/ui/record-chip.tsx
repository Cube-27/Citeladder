import type { ReactNode } from 'react';

import { ProjectLink } from '@/components/ui/project-link';

/**
 * RecordChip — one CiteLadder record named inside text (an Action in a reply
 * or a mention): a `surface` pill at the small control height that links to
 * the record's screen in this project, its label truncating before the
 * optional mark after it (a status badge).
 */
export function RecordChip({
  href,
  label,
  mark,
}: Readonly<{ href: string; label: string; mark?: ReactNode }>) {
  return (
    <ProjectLink
      href={href}
      className="text-ink border-line bg-surface focus-ring hover:overlay-hover text-body-sm inline-flex h-[var(--control-sm)] max-w-full items-center gap-1 rounded-sm border ps-2 pe-1 align-middle no-underline"
    >
      <span className="min-w-0 truncate">{label}</span>
      {/* Read as two words; flex layout drops the space visually. */} {mark}
    </ProjectLink>
  );
}
