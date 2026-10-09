import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { textRole, type TextRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * TextLink — the one text link.
 *
 * Five recipes existed: accent ink with underline on hover at four different
 * type roles, secondary ink turning accent on hover, accent with an
 * `ArrowUpRight`, an external link with a hand-placed icon, and "← Back to
 * runs" typed as a character. One recipe now: accent ink (links are actions),
 * underline on hover, the shared focus ring, and the text role the link sits
 * at (`control` by default; `inherit` inside a sentence).
 *
 *   - `internal` — an app route through the router (`href`).
 *   - `external` — an API-supplied http(s) URL: new tab, `noopener
 *     noreferrer`, a trailing external glyph and "(opens in a new tab)" for
 *     assistive tech. An unsafe or missing URL renders as plain text
 *     (`ExternalHttpLink`).
 *   - `back` — the detail route's way up: an arrow glyph and the label
 *     ("Back to runs"); never a typed "←".
 *
 * `asChild` keeps the recipe on a link the caller must own — a
 * project-scoped `ProjectLink` — and still places the glyphs inside it.
 */
export type TextLinkVariant = 'internal' | 'external' | 'back';
export type TextLinkText = TextRole | 'inherit';

function textLinkClasses({
  variant = 'internal',
  text = 'control',
}: Readonly<{ variant?: TextLinkVariant; text?: TextLinkText }> = {}) {
  const recipe = cn(
    'focus-ring text-accent-text rounded-xs underline-offset-2 hover:underline',
    variant !== 'internal' && 'inline-flex items-center gap-1',
  );
  return text === 'inherit' ? recipe : textRole(text, recipe);
}

type TextLinkProps = Readonly<
  Omit<ComponentPropsWithRef<'a'>, 'href'> & {
    variant?: TextLinkVariant;
    text?: TextLinkText;
    /** The destination; an app route for `internal`/`back`, a URL for `external`. */
    href?: string | null;
    /** Apply the recipe (and glyphs) to the single child link instead. */
    asChild?: boolean;
    children: ReactNode;
  }
>;

/**
 * The link's content with its glyphs, as a flat list of nodes — not wrapped in
 * a component or fragment — so that under `asChild` the Radix `Slot` sees the
 * `Slottable` among its direct children and merges the recipe onto the
 * caller's link while keeping the glyphs inside it.
 */
function withGlyphs(variant: TextLinkVariant, children: ReactNode): ReactNode[] {
  const label = <Slottable key="label">{children}</Slottable>;
  if (variant === 'back') {
    return [<ArrowLeft key="glyph" className="size-3.5 shrink-0" aria-hidden />, label];
  }
  if (variant === 'external') {
    return [
      label,
      <ExternalLink key="glyph" className="size-3.5 shrink-0" aria-hidden />,
      ' ',
      <span key="note" className="sr-only">
        (opens in a new tab)
      </span>,
    ];
  }
  return [label];
}

export function TextLink({
  variant = 'internal',
  text = 'control',
  href,
  asChild = false,
  className,
  children,
  ...props
}: TextLinkProps) {
  const classes = cn(textLinkClasses({ variant, text }), className);
  const content = withGlyphs(variant, children);
  if (asChild) {
    return (
      <Slot {...props} className={classes}>
        {content}
      </Slot>
    );
  }
  if (variant === 'external') {
    return (
      <ExternalHttpLink {...props} href={href} className={classes}>
        {content}
      </ExternalHttpLink>
    );
  }
  return (
    <Link {...props} to={href ?? ''} className={classes}>
      {content}
    </Link>
  );
}
