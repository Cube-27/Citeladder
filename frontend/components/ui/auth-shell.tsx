import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cloneElement, useId, type ComponentProps, type ReactElement, type ReactNode } from 'react';

import { AuthShowcase } from '@/components/ui/auth-showcase';
import { Button, type ButtonProps } from '@/components/ui/button';
import { CARD_FACE } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { LogoMark } from '@/components/ui/logo-mark';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { websiteHref } from '@/lib/config/app-link';
import type { Turnstile } from '@/lib/turnstile/use-turnstile';
import { cn } from '@/lib/utils';

/**
 * The CiteLadder logo linking home. The public home lives on the website
 * origin; "/" on the app origin is the product root, which a signed-out
 * visitor cannot use.
 */
export function AuthLogo() {
  return (
    <a
      href={websiteHref('/')}
      aria-label="CiteLadder home"
      className="focus-ring text-ink inline-flex rounded-sm p-1"
    >
      <LogoMark size={22} />
    </a>
  );
}

/**
 * AuthSplitShell — account access (sign-in, sign-up and the mailbox screens)
 * across the whole viewport (D24, the pre-redesign layout): the sign-in form
 * (no card) centred in a column on `paper` with the ThemeSwitch above it and the
 * caller's footer line under it, and from `desktop:` the black-and-white
 * product showcase beside it. Below `desktop:` the showcase drops away and the
 * card has the width. The document scrolls, so a tall form on a short laptop
 * never squeezes; the showcase stays pinned beside it.
 */
export function AuthSplitShell({
  footer,
  children,
}: Readonly<{
  /** One line at the column's foot (the copyright and legal links). */
  footer: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="bg-paper text-ink desktop:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] grid min-h-dvh antialiased">
      <div className="desktop:px-[var(--card-padding)] grid min-h-dvh grid-rows-[auto_minmax(0,1fr)_auto] px-4">
        <div className="flex h-[var(--nav-height)] items-center justify-end">
          <ThemeSwitch />
        </div>
        <main
          id="main"
          aria-label="Account access"
          className="grid content-center justify-items-center pb-8"
        >
          <div className="w-full max-w-120">{children}</div>
        </main>
        <footer className="text-caption text-ink-muted py-4 text-center">{footer}</footer>
      </div>
      <AuthShowcase />
    </div>
  );
}

/**
 * AuthShell — the frame for the workspace chooser and the setup screens'
 * loading, failure and blocked states (setup itself is OnboardingShell):
 * the logo top-left, the ThemeSwitch top-right, and one
 * `container-narrow` column on the `paper` ground. The column is top-aligned
 * with `space-12` above it, so cards of different heights never move their
 * top edge between steps. No navigation, footer links or illustrations.
 */
export function AuthShell({
  mainLabel,
  barEnd,
  children,
}: Readonly<{
  /** The landmark name of the column ("Account access", "Project setup"). */
  mainLabel: string;
  /** Before the ThemeSwitch: a way out, the account menu. */
  barEnd?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="bg-paper text-ink flex min-h-dvh flex-col antialiased">
      <header className="desktop:px-[var(--card-padding)] flex h-[var(--nav-height)] shrink-0 items-center justify-between gap-4 px-4">
        {/* Optically flush with the gutter: the link's 4px focus inset hangs out. */}
        <span className="-ms-1 inline-flex">
          <AuthLogo />
        </span>
        <div className="flex items-center gap-3">
          {barEnd}
          <ThemeSwitch />
        </div>
      </header>
      <main
        id="main"
        aria-label={mainLabel}
        className="desktop:px-[var(--card-padding)] desktop:pt-12 desktop:pb-24 flex flex-1 items-start justify-center px-4 pt-[var(--card-padding)] pb-16"
      >
        <div className="max-w-narrow w-full">{children}</div>
      </main>
    </div>
  );
}

/**
 * The card's head: an optional 40px icon tile, the title 32/38 in the sans
 * face at 500 (the app sets no display face, decision D54) and a 16/26 line
 * under it. The title is the page's one `h1`; it takes focus by
 * script (`tabIndex -1`) when a flow moves to a new step.
 */
function AuthHead({
  id,
  title,
  sub,
  icon,
  centred,
}: Readonly<{
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  centred: boolean;
}>) {
  return (
    <header
      className={cn('flex flex-col gap-2', centred ? 'items-center text-center' : 'items-start')}
    >
      {icon ? (
        <span
          aria-hidden
          className="bg-surface text-ink-secondary mb-2 grid size-10 place-items-center rounded-md shadow-xs"
        >
          <Icon icon={icon} />
        </span>
      ) : null}
      <h1
        id={id}
        tabIndex={-1}
        className="text-display-lg text-ink font-sans font-medium text-balance"
      >
        {title}
      </h1>
      {sub ? <p className="text-body text-ink-secondary">{sub}</p> : null}
    </header>
  );
}

type AuthCardProps = Readonly<{
  title: ReactNode;
  /** The heading's id, when a flow moves focus to it; generated otherwise. */
  titleId?: string;
  sub?: ReactNode;
  icon?: LucideIcon;
  /** One line under the card. */
  after?: ReactNode;
  children?: ReactNode;
}>;

function AuthCardFrame({
  title,
  titleId,
  sub,
  icon,
  after,
  children,
  signIn,
}: AuthCardProps & Readonly<{ signIn: boolean }>) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  return (
    <div className="flex flex-col gap-[var(--card-padding)]">
      <section
        aria-labelledby={headingId}
        className={cn(
          'text-ink flex flex-col gap-[var(--card-padding)]',
          // Account access sits straight on the left half's `paper`, with no
          // card (owner, 2026-11-06), and keeps the pre-redesign 44px
          // controls (D24): every button and field inside reads `control-md`.
          signIn
            ? '[--control-md:44px]'
            : cn(CARD_FACE, 'surface-card desktop:p-10 p-[var(--card-padding)]'),
        )}
      >
        {signIn ? (
          <div className="flex justify-center">
            <AuthLogo />
          </div>
        ) : null}
        <AuthHead id={headingId} title={title} sub={sub} icon={icon} centred={signIn} />
        {children}
      </section>
      {after ? <p className="text-body-sm text-ink-secondary text-center">{after}</p> : null}
    </div>
  );
}

/**
 * AuthCard — one card on the Card's face (`surface`, 1px `line`), `radius-lg` and
 * `space-10` padding (`space-6` on phones): the head, then the body
 * (`space-6` apart), and an optional line under the card (`after`). Used by
 * the workspace chooser and the setup screens' loading, failure and blocked
 * states; the setup steps themselves are OnboardingStep.
 */
export function AuthCard(props: AuthCardProps) {
  return <AuthCardFrame {...props} signIn={false} />;
}

/**
 * AuthSignInCard — the account-access form inside AuthSplitShell (D24): the
 * AuthCard's head and body with the logo centred at its top, a centred head
 * and the 44px controls, but no card: no fill, edge, radius, shadow or
 * padding box, so the whole left half is one plain `paper` surface (owner,
 * 2026-11-06). Used by sign-in, sign-up and the mailbox screens.
 */
export function AuthSignInCard(props: AuthCardProps) {
  return <AuthCardFrame {...props} signIn />;
}

/** The card's full-width action: the submit, or "Continue with Google". */
export function AuthButton(props: Readonly<Omit<ButtonProps, 'className'>>) {
  return <Button {...props} className="w-full" />;
}

/**
 * The "or" between Google and the email form: a hairline either side. It is
 * decoration: both ways in are announced in reading order on their own.
 */
export function AuthDivider() {
  return (
    <div
      aria-hidden
      className="text-caption text-ink-muted before:bg-line after:bg-line flex items-center gap-3 before:h-px before:flex-1 after:h-px after:flex-1"
    >
      or
    </div>
  );
}

/** The email form's fields, check and submit, `space-4` apart. */
export function AuthForm({
  onSubmit,
  children,
}: Readonly<{ onSubmit: NonNullable<ComponentProps<'form'>['onSubmit']>; children: ReactNode }>) {
  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {children}
    </form>
  );
}

/**
 * The Cloudflare Turnstile slot: the flexible widget's 65px (the compact
 * widget's 140px on a slot narrower than 300px), reserved before the widget
 * loads and kept after it completes, so the submit never moves. A notice
 * shares the same cell when the widget cannot load.
 */
export function AuthHumanCheck({
  widget: { container, size, failed },
}: Readonly<{ widget: Pick<Turnstile, 'container' | 'size' | 'failed'> }>) {
  return (
    <fieldset
      aria-label="Verification"
      data-size={size}
      className={cn(
        'm-0 grid min-w-0 justify-items-center overflow-hidden border-0 p-0 *:col-start-1 *:row-start-1 *:self-center',
        size === 'compact' ? 'h-[140px]' : 'h-[65px]',
      )}
    >
      {/* Full width so the hook measures the slot, not an empty box (0px → compact). */}
      <div ref={container} className="w-full" />
      {failed ? (
        <p className="text-caption text-ink-muted text-center">
          Verification could not load. Refresh the page to try again.
        </p>
      ) : null}
    </fieldset>
  );
}

/** The agreement line closing the card: 12/18 `ink-muted`, centred. */
export function AuthLegal({ id, children }: Readonly<{ id?: string; children: ReactNode }>) {
  return (
    <p id={id} className="text-caption text-ink-muted text-center text-balance">
      {children}
    </p>
  );
}

/** A row of the card's buttons, `space-2` apart, wrapping on a phone. */
export function AuthActions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** A row of small links inside the form (14/20), spread to its edges. */
export function AuthLinkRow({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="text-body-sm flex flex-wrap justify-between gap-x-4 gap-y-1">{children}</p>;
}

/**
 * A list of whole-row choices (the workspace chooser's rows), divided by rules
 * and never boxed: it sits inside the AuthCard, and a container never holds a
 * second bordered box (D51).
 */
export function AuthRowList({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <ul aria-label={label} className="divide-line divide-y overflow-hidden rounded-md">
      {children}
    </ul>
  );
}

const AUTH_ROW =
  'focus-ring-inset text-ink hover:overlay-hover flex h-18 w-full cursor-pointer items-center gap-3 px-4 text-left no-underline transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none';

type RowLink = ReactElement<{ className?: string; children?: ReactNode }>;

/**
 * One 72px row: a 40px lead, the name (16/24 medium) over a meta line (14/20
 * `ink-muted`), an optional trailing badge and a chevron. Hover is
 * `surface-sunken`, focus a 2px inset ring; long names end in an ellipsis.
 * The row is a button (`onSelect`) or the caller's link element (`link`).
 */
export function AuthRow({
  lead,
  name,
  meta,
  trailing,
  action,
}: Readonly<{
  lead: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  action: { onSelect: () => void } | { link: RowLink };
}>) {
  const content = (
    <>
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-label-lg text-ink truncate font-normal">{name}</span>
        {meta ? <span className="text-body-sm text-ink-muted truncate">{meta}</span> : null}
      </span>
      {trailing}
      <Icon icon={ChevronRight} className="text-ink-muted" />
    </>
  );
  return (
    <li>
      {'link' in action ? (
        cloneElement(action.link, { className: AUTH_ROW, children: content })
      ) : (
        <button type="button" onClick={action.onSelect} className={AUTH_ROW}>
          {content}
        </button>
      )}
    </li>
  );
}

/** The create row's lead: a 40px dashed tile with the glyph. */
export function AuthRowTile({ icon }: Readonly<{ icon: LucideIcon }>) {
  return (
    <span
      aria-hidden
      className="border-line-strong text-ink-secondary grid size-10 shrink-0 place-items-center rounded-sm border border-dashed"
    >
      <Icon icon={icon} />
    </span>
  );
}
