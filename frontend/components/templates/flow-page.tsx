import { type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { Icon } from '@/components/ui/icon';
import { LogoMark } from '@/components/ui/logo-mark';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { textRole } from '@/components/ui/typography';
import { websiteHref } from '@/lib/config/app-link';
import { cn } from '@/lib/utils';

import { FLOW_CARD } from './notice-page';

/**
 * The CiteLadder logo linking home. The public home lives on the website
 * origin; "/" on the app origin is the product root, which a signed-out
 * visitor cannot use.
 */
export function FlowLogo() {
  return (
    <a
      href={websiteHref('/')}
      aria-label="CiteLadder home"
      className="focus-ring text-ink rounded-control -ms-1 inline-flex p-1"
    >
      <LogoMark size={22} />
    </a>
  );
}

/**
 * Flow: a one-screen page with no shell. Sign-in, sign-up, the mailbox
 * screens, the workspace chooser, an invitation and setup's blocked notices.
 * A bar as tall as the page header holds the logo and a way out (`barEnd`, the
 * account menu) with the theme switch. Under it, on the ground, one 480px
 * panel (`rule` edge, radius 8, 24 padding) starting a fifth of the way down
 * the window, with the app's controls. `footer` is one caption line at the
 * foot. Multi-step setup uses SetupPage instead.
 */
export function FlowPage({
  label,
  kicker = label,
  barEnd,
  footer,
  children,
}: Readonly<{
  /** The main landmark's name and the card's kicker ("Account access"). */
  label: string;
  /** The kicker in place of `label`; `null` for none, when the heading says the same. */
  kicker?: string | null;
  barEnd?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="bg-ground text-ink flex min-h-dvh flex-col antialiased">
      <header className="flex min-h-[var(--masthead-height)] shrink-0 items-center justify-between gap-[var(--card-padding)] px-[var(--content-gutter)]">
        <span className="inline-flex">
          <FlowLogo />
        </span>
        <div className="flex items-center gap-2">
          {barEnd}
          <ThemeSwitch />
        </div>
      </header>
      <main
        id="main"
        aria-label={label}
        className="max-w-flow mx-auto flex w-full flex-1 flex-col px-[var(--content-gutter)] pt-[max(var(--flow-gap),calc(20dvh-var(--masthead-height)))] pb-[var(--flow-gap)]"
      >
        <div className={cn(FLOW_CARD, 'flex flex-col gap-4')}>
          {kicker === null ? null : <p className={textRole('captionStrong')}>{kicker}</p>}
          <div className="flex flex-col">{children}</div>
        </div>
      </main>
      {footer ? (
        <footer className={textRole('caption', 'px-[var(--content-gutter)] py-4 text-center')}>
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

/**
 * A flow's heading (the `title` role, as the new-chat greeting) and the line
 * under it; the page's one `h1`, which takes focus by script (tabIndex -1)
 * when a flow moves to a new step. A heading in words also names the document
 * ("Sign in · CiteLadder").
 */
function FlowHead({
  id,
  title,
  sub,
  icon,
}: Readonly<{ id: string; title: ReactNode; sub?: ReactNode; icon?: LucideIcon }>) {
  useDocumentTitle(typeof title === 'string' ? title : undefined);
  return (
    <header className="flex flex-col gap-2">
      {icon ? <Icon icon={icon} className="text-ink-2" /> : null}
      <h1 id={id} tabIndex={-1} className={textRole('title', 'text-balance')}>
        {title}
      </h1>
      {sub ? <p className={textRole('body', 'text-ink-2')}>{sub}</p> : null}
    </header>
  );
}

/**
 * One flow screen's content: the heading and its line, then the body 24
 * below, then the closing lines 24 under it (`after`: the sign-in/sign-up
 * switch and the agreement line), inside the flow's card.
 */
export function FlowBlock({
  title,
  titleId,
  sub,
  icon,
  after,
  children,
}: Readonly<{
  title: ReactNode;
  /** The heading's id; generated otherwise. */
  titleId?: string;
  sub?: ReactNode;
  icon?: LucideIcon;
  after?: ReactNode;
  children?: ReactNode;
}>) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  return (
    <div className="flex flex-col gap-[var(--page-top-gap)]">
      <section aria-labelledby={headingId} className="flex flex-col gap-[var(--page-top-gap)]">
        <FlowHead id={headingId} title={title} sub={sub} icon={icon} />
        {children}
      </section>
      {after ? (
        <div className={textRole('body', 'flex flex-col gap-4 text-ink-2')}>{after}</div>
      ) : null}
    </div>
  );
}
