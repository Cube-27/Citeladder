import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { displayHeadingLgClasses } from '@/components/ui/typography';

/**
 * EmptyState — the one empty-state pattern for the whole app.
 *
 * Replaces the per-surface empty states that had each grown their own copy and
 * layout. Shape: a small icon beside the heading → one short line → one action,
 * hung on the section's left margin. It is not a card: an empty region should
 * read as absent content on the page, not as an object floating on it.
 *
 * **Keep `description` to a single sentence.** The empty states this replaces
 * had drifted into two- and three-clause explanations of what the screen would
 * eventually contain, which is what made them feel crowded. Say what is missing
 * and what to do about it; the screen itself explains the rest once it has
 * data. The prop is optional precisely so surfaces can omit it when the
 * heading already says everything.
 *
 * `action` is a single primary control. Pass a second one only when both are
 * genuinely equal choices — otherwise the secondary path belongs in the body of
 * the screen, not in its empty state.
 */
export function EmptyState({
  icon: Icon,
  heading,
  description,
  action,
  footnote,
  className,
}: Readonly<{
  icon: LucideIcon;
  heading: string;
  /** One sentence. See the note above before making it two. */
  description?: string;
  action?: ReactNode;
  /** Small muted line below the action (e.g. a support correlation reference). */
  footnote?: ReactNode;
  className?: string;
}>) {
  return (
    <div className={cn('grid gap-3 py-[var(--empty-state-padding)]', className)}>
      <div className="flex items-center gap-2">
        <Icon className="text-subtle size-4 shrink-0" aria-hidden />
        <h2 className={displayHeadingLgClasses}>{heading}</h2>
      </div>
      {description ? <p className="text-secondary max-w-[52ch] text-sm">{description}</p> : null}
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
      {footnote ? <div className="text-muted text-xs">{footnote}</div> : null}
    </div>
  );
}
