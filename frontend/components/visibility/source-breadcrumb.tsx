import type { ReactNode } from 'react';

import { ChevronRight } from '@/lib/icons';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';

/**
 * Where in Sources the reader is, and the way back out.
 *
 * A real `<nav>` with a list, not a row of styled buttons: the trail is how
 * someone using a screen reader learns there is a level above this one, and a
 * back arrow alone never says what it goes back TO.
 *
 * The last crumb is the current page and is not a control. Making it one would
 * offer a reader a link to where they already are. Without `current` the
 * trail ends at its last crumb: the page's own heading names the page.
 */
export function SourceBreadcrumb({
  trail,
  current,
  actions,
}: Readonly<{
  trail: readonly { label: string; onClick: () => void }[];
  current?: string;
  actions?: ReactNode;
}>) {
  return (
    <Inline gap="compact" className="flex-wrap">
      <nav aria-label="Sources breadcrumb" className="min-w-0 flex-1">
        <Inline as="ol" gap="tight" className="flex-wrap">
          {trail.map((crumb, index) => (
            <Inline as="li" gap="tight" key={crumb.label}>
              <TextLink asChild tone="muted" text="caption">
                <Pressable onClick={crumb.onClick} className="w-auto">
                  {crumb.label}
                </Pressable>
              </TextLink>
              {current !== undefined || index < trail.length - 1 ? (
                <Icon icon={ChevronRight} className="text-ink-2" />
              ) : null}
            </Inline>
          ))}
          {current === undefined ? null : (
            <li className="min-w-0">
              <span aria-current="page" className={textRole('heading', 'block truncate')}>
                {current}
              </span>
            </li>
          )}
        </Inline>
      </nav>
      {actions}
    </Inline>
  );
}
