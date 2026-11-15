import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { ProjectLink } from '@/components/ui/project-link';
import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { textRole, type TextRole } from '@/components/ui/typography';
import { parseAbsoluteHttpUrl } from '@/lib/safe-http-url';
import { cn } from '@/lib/utils';

/**
 * TextLink — the text link, with the 2px focus ring.
 *
 * A link is always underlined at rest, wherever it stands (a sentence, a
 * table cell, a row title), so it never depends on colour or position alone;
 * text that is not a link is never underlined (an unsafe external URL renders
 * as plain text without one).
 *
 *   tone `ink` (default, the app): `ink` with a `control-line` underline
 *     that turns `ink` on hover.
 *   tone `prose` (docs, blog and legal copy): `accent-ink` with a solid
 *     underline that thickens on hover.
 *   tone `muted` (footers, metadata): `ink-2` with the same underline.
 *
 *   variant `internal` — an app route, scoped to the active project (or
 *     `projectId`) through `ProjectLink`.
 *   variant `external` — an API-supplied http(s) URL: a new tab, `noopener
 *     noreferrer`, a 14px `arrow-up-right` and "(opens in a new tab)" for
 *     assistive tech. An unsafe or missing URL renders as plain text.
 *
 * `text` is the type role the link sits at (`control` by default; `inherit`
 * only inside a sentence: a link in a list or table cell takes the role of
 * its text). `asChild` keeps the recipe on a link the caller owns.
 */
type TextLinkVariant = 'internal' | 'external';
export type TextLinkText = TextRole | 'inherit';
export type TextLinkTone = 'ink' | 'prose' | 'muted';

const TONE: Record<TextLinkTone, string> = {
  ink: 'text-ink',
  prose: 'text-accent-text',
  muted: 'text-ink-2 hover:text-ink',
};

const UNDERLINE = {
  prose: 'decoration-current hover:decoration-2',
  ink: 'decoration-control-line hover:decoration-current focus-visible:decoration-current',
} as const;

function textLinkClasses({ tone, text }: Readonly<{ tone: TextLinkTone; text: TextLinkText }>) {
  const recipe = cn(
    'focus-ring rounded-mark underline decoration-1 underline-offset-3 transition-[color,text-decoration-color]',
    TONE[tone],
    tone === 'prose' ? UNDERLINE.prose : UNDERLINE.ink,
  );
  return text === 'inherit' ? recipe : textRole(text, recipe);
}

/**
 * Where the link goes. Each variant takes only the props it reads: a project
 * scope means nothing to an external URL, and under `asChild` the child link
 * owns its destination.
 */
type TextLinkTarget =
  | {
      variant?: 'internal';
      /** An app route. */
      href?: string | null;
      /** The project the route belongs to, when not the active one. */
      projectId?: string | null;
      asChild?: false;
    }
  | {
      variant: 'external';
      /** An http(s) URL. */
      href?: string | null;
      projectId?: never;
      asChild?: false;
    }
  | {
      variant?: TextLinkVariant;
      href?: never;
      projectId?: never;
      /** Apply the recipe (and glyphs) to the single child link instead. */
      asChild: true;
    };

type TextLinkProps = Readonly<
  Omit<ComponentPropsWithRef<'a'>, 'href'> &
    TextLinkTarget & {
      tone?: TextLinkTone;
      text?: TextLinkText;
      children: ReactNode;
    }
>;

/**
 * The link's content with its glyphs, as a flat list of nodes, so that under
 * `asChild` the Radix `Slot` sees the `Slottable` among its direct children.
 */
function withGlyphs(variant: TextLinkVariant, children: ReactNode): ReactNode[] {
  const label = <Slottable key="label">{children}</Slottable>;
  if (variant === 'external') {
    return [
      label,
      <ArrowUpRight key="glyph" className="ms-0.5 inline size-3.5 align-[-2px]" aria-hidden />,
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
  tone = 'ink',
  text = 'body',
  href,
  projectId,
  asChild = false,
  className,
  children,
  ...props
}: TextLinkProps) {
  if (variant === 'external' && !asChild && !parseAbsoluteHttpUrl(href)) {
    return (
      <span
        className={cn(text === 'inherit' ? className : textRole(text, className), 'no-underline')}
        title={props.title}
      >
        {children}
      </span>
    );
  }
  const classes = cn(textLinkClasses({ tone, text }), className);
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
    <ProjectLink {...props} href={href ?? ''} projectId={projectId} className={classes}>
      {content}
    </ProjectLink>
  );
}

/**
 * ArrowLink — a standalone "go there" link: the label and an `arrow-right` in
 * `ink`, 16/24 medium, 8px apart. The label is underlined at rest (1px, 4px
 * offset, `control-line`), turning `ink` on hover as the arrow moves 2px
 * right in 120ms; under reduced motion the arrow stays still. Without `href` it renders a span for the last line
 * of a card that is itself the link (the card's hover drives it). An app
 * route is scoped to the active project through `ProjectLink`.
 */
export function ArrowLink({
  href,
  projectId,
  children,
}: Readonly<{ href?: string; projectId?: string | null; children: ReactNode }>) {
  const content = (
    <>
      <span className="decoration-control-line underline decoration-1 underline-offset-4 transition-[text-decoration-color] group-hover:decoration-current">
        {children}
      </span>
      <ArrowRight
        aria-hidden
        className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      />
    </>
  );
  const classes = 'text-ink inline-flex items-center gap-2 rounded-mark text-label-lg no-underline';
  if (!href) return <span className={classes}>{content}</span>;
  return (
    <ProjectLink href={href} projectId={projectId} className={cn(classes, 'group focus-ring')}>
      {content}
    </ProjectLink>
  );
}
