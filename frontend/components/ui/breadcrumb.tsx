import { ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import { ProjectLink } from '@/components/ui/project-link';
import { textRole } from '@/components/ui/typography';

/** One step of the trail: a link back up (with the history state it opens with), or the page itself. */
export type Crumb = Readonly<{
  label: string;
  href?: string;
  state?: unknown;
  /** Drawn before the page's own name, such as a brand's logo. */
  mark?: ReactNode;
}>;

/**
 * Where a page sits, one line in the masthead: each step up is a quiet link
 * cut at 272px, the last is the page itself. The whole trail cuts rather
 * than wraps, so a long title never changes the masthead's height. A page
 * whose body has no h1 of its own passes `heading`: the page's name in the
 * trail is then its h1, drawn the same.
 */
export function Breadcrumb({
  parts,
  heading = false,
}: Readonly<{ parts: readonly Crumb[]; heading?: boolean }>) {
  const current = parts.at(-1);
  const Name = heading ? 'h1' : 'span';
  return (
    // As the masthead's title: under `rail` it adds no width of its own, so a long trail cuts.
    <nav aria-label="Breadcrumb" className="not-rail:w-0 flex min-w-28 flex-1">
      <ol className={textRole('body', 'text-ink-2 flex min-w-0 items-center gap-2')}>
        {parts.slice(0, -1).map((part) => (
          <Fragment key={part.label}>
            <li className="min-w-0 shrink">
              {part.href ? (
                <ProjectLink
                  href={part.href}
                  state={part.state}
                  className="hover:overlay-hover hover:text-ink focus-ring block max-w-68 truncate rounded-sm px-1"
                >
                  {part.label}
                </ProjectLink>
              ) : (
                <span className="block max-w-68 truncate px-1">{part.label}</span>
              )}
            </li>
            <li aria-hidden className="shrink-0">
              <ChevronRight className="block size-3" />
            </li>
          </Fragment>
        ))}
        {current ? (
          <li aria-current="page" className="text-ink flex min-w-0 items-center gap-2">
            {current.mark}
            <Name className="min-w-0 truncate">{current.label}</Name>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
