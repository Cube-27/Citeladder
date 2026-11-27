import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { ProjectLink } from '@/components/ui/project-link';
import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { HEADING_LINK_FACE } from '@/components/ui/link-look';
import { TEXT_ROLE_CLASS, type TextRole } from '@/components/ui/text-role';
import { ArrowRight, ArrowUpRight } from '@/lib/icons';
import { parseAbsoluteHttpUrl } from '@/lib/safe-http-url';
import { cn } from '@/lib/utils';

type TextLinkVariant = 'internal' | 'external';
export type TextLinkText = TextRole | 'inherit';
export type TextLinkTone = 'ink' | 'prose' | 'muted' | 'quiet';

const TONE: Record<TextLinkTone, string> = {
  ink: 'text-ink',
  prose: 'text-accent-text',
  muted: 'text-ink-2 hover:text-ink',
  quiet: 'text-ink-2',
};

const UNDERLINE = {
  prose: 'decoration-current hover:decoration-2',
  ink: 'decoration-control-line hover:decoration-link focus-visible:decoration-link',
  hover: 'text-ink decoration-transparent hover:decoration-link focus-visible:decoration-link',
} as const;

export type TextLinkUnderline = 'always' | 'hover';

function lineClasses(tone: TextLinkTone, underline: TextLinkUnderline) {
  if (underline === 'hover') return cn(UNDERLINE.hover, tone === 'quiet' && TONE.quiet);
  return cn(TONE[tone], tone === 'prose' ? UNDERLINE.prose : UNDERLINE.ink);
}

function textLinkClasses({
  tone,
  text,
  underline,
}: Readonly<{ tone: TextLinkTone; text: TextLinkText; underline: TextLinkUnderline }>) {
  const recipe = cn(
    'focus-ring rounded-mark underline decoration-1 underline-offset-3 app:link-rule app:underline-offset-4 transition-underline',
    lineClasses(tone, underline),
  );
  return text === 'inherit' ? recipe : cn(TEXT_ROLE_CLASS[text], recipe);
}

type TextLinkTarget =
  | {
      variant?: 'internal';
      href?: string | null;
      projectId?: string | null;
      asChild?: false;
    }
  | {
      variant: 'external';
      href?: string | null;
      projectId?: never;
      asChild?: false;
    }
  | {
      variant?: TextLinkVariant;
      href?: never;
      projectId?: never;
      asChild: true;
    };

const BOX = {
  shrink: 'min-w-0',
  row: 'flex min-w-0',
  'row-full': 'flex max-w-full min-w-0',
  'row-fit': 'flex w-fit max-w-full min-w-0 items-center',
  'row-glyph': 'flex min-w-0 items-center [&>svg]:shrink-0',
  target: 'inline-flex min-h-target items-center',
  'target-shrink': 'inline-flex min-h-target min-w-0 items-center',
  start: 'justify-self-start',
  end: 'ms-auto',
  fit: 'w-fit',
  nowrap: 'whitespace-nowrap',
  block: 'block min-w-0',
  'row-center': 'flex min-w-0 items-center',
  cover: 'phone:flex-1 min-w-0 shrink before:absolute before:inset-x-0 before:inset-y-0',
} as const;

type TextLinkProps = Readonly<
  Omit<ComponentPropsWithRef<'a'>, 'href' | 'className' | 'style'> &
    TextLinkTarget & {
      tone?: TextLinkTone;
      text?: TextLinkText;
      underline?: TextLinkUnderline;
      truncate?: boolean;
      box?: keyof typeof BOX;
      children: ReactNode;
    }
>;

function withGlyphs(variant: TextLinkVariant, children: ReactNode): ReactNode[] {
  const label = <Slottable key="label">{children}</Slottable>;
  if (variant === 'external') {
    const glyph = (
      <ArrowUpRight
        key="glyph"
        className="align-glyph ms-0.5 inline size-3.5 [:root:not([data-public-surface])_&]:ms-2"
        aria-hidden
      />
    );
    const split = typeof children === 'string' ? /^(.*\s)?(\S+)\s*$/su.exec(children) : null;
    return [
      ...(split
        ? [
            split[1] ?? '',
            <span key="tail" className="whitespace-nowrap">
              {split[2]}
              {glyph}
            </span>,
          ]
        : [label, glyph]),
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
  underline = 'always',
  truncate = false,
  href,
  projectId,
  asChild = false,
  box,
  children,
  ...props
}: TextLinkProps) {
  const className = box && BOX[box];
  if (variant === 'external' && !asChild && !parseAbsoluteHttpUrl(href)) {
    return (
      <span
        className={cn(
          text === 'inherit' ? className : cn(TEXT_ROLE_CLASS[text], className),
          'no-underline',
        )}
        title={props.title}
      >
        {children}
      </span>
    );
  }
  const classes = cn(textLinkClasses({ tone, text, underline }), truncate && 'truncate', className);
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
      <Slot className={classes}>
        <ExternalHttpLink {...props} href={href}>
          {content}
        </ExternalHttpLink>
      </Slot>
    );
  }
  return (
    <Slot className={classes}>
      <ProjectLink {...props} href={href ?? ''} projectId={projectId}>
        {content}
      </ProjectLink>
    </Slot>
  );
}

export function ArrowLink({
  href,
  projectId,
  children,
}: Readonly<{ href?: string; projectId?: string | null; children: ReactNode }>) {
  const content = (
    <>
      <span className="decoration-control-line transition-underline-color underline decoration-1 underline-offset-4 [@media(hover:hover)_and_(pointer:fine)]:group-hover:decoration-current">
        {children}
      </span>
      <ArrowRight
        aria-hidden
        className="size-3.5 shrink-0 transition-transform motion-reduce:transition-none motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-x-0.5"
      />
    </>
  );
  if (!href) return <span className={HEADING_LINK_FACE}>{content}</span>;
  return (
    <ProjectLink href={href} projectId={projectId} look="heading">
      {content}
    </ProjectLink>
  );
}
