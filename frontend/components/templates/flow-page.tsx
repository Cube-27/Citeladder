import { Check, ChevronLeft, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { LogoMark } from '@/components/ui/logo-mark';
import { Tag } from '@/components/ui/tag';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { textRole } from '@/components/ui/typography';
import { websiteHref } from '@/lib/config/app-link';
import { cn } from '@/lib/utils';

/**
 * The CiteLadder logo linking home. The public home lives on the website
 * origin; "/" on the app origin is the product root, which a signed-out
 * visitor cannot use.
 */
function FlowLogo() {
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
 * Flow: a page with no shell. Sign-in, sign-up, the
 * mailbox screens, the workspace chooser, workspace and project setup and an
 * invitation. A bar as tall as the masthead holds the logo and a way out
 * (`barEnd`, the account menu) with the theme switch. Under it one 480px
 * column, starting a fifth of the way down the window: a flow with steps
 * opens it with the horizontal rung trail, then the column hangs from an ink
 * rule with a mono overline naming the step ("Step 1 of 3 · Basics", or the
 * flow's `label`), then the heading and the form; its controls are 44 tall.
 * `footer` is one caption line at the foot.
 */
export function FlowPage({
  label,
  steps,
  current = 0,
  barEnd,
  footer,
  children,
}: Readonly<{
  /** The main landmark's name and the overline of a one-screen flow ("Account access"). */
  label: string;
  /** The flow's steps; leave out for a one-screen flow. */
  steps?: readonly [string, ...string[]];
  /** 0-based. */
  current?: number;
  barEnd?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}>) {
  const index = steps ? Math.max(0, Math.min(steps.length - 1, current)) : 0;
  const overline = steps ? `Step ${index + 1} of ${steps.length} · ${steps[index]}` : label;
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
        className="max-w-flow mx-auto flex w-full flex-1 flex-col gap-[var(--workspace-gap)] px-[var(--content-gutter)] pt-[max(var(--flow-gap),calc(20dvh-var(--masthead-height)))] [--control-md:var(--control-lg)]"
      >
        {steps ? <FlowRungTrail steps={steps} current={index} /> : null}
        <div className="border-rule-ink flex flex-1 flex-col gap-4 border-t pt-3">
          <p aria-hidden={steps ? true : undefined} className="type-overline">
            {overline}
          </p>
          <div className="flex flex-1 flex-col">{children}</div>
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
 * The flow's steps as a horizontal rung trail at the top of the column, with
 * the form it describes: a done step's ink rung with a check, the current
 * step's accent rung (you are here), a later step's rule rung, each with its
 * whole label; a narrow column wraps the trail, never cuts a label. The
 * current step is `aria-current="step"`, and the count is a native progress
 * bar named by the current step.
 */
function FlowRungTrail({
  steps,
  current,
}: Readonly<{ steps: readonly [string, ...string[]]; current: number }>) {
  const count = `Step ${current + 1} of ${steps.length}`;
  return (
    <section aria-label="Setup progress" className="flex min-w-0">
      <progress
        className="sr-only"
        aria-label={steps[current]}
        max={steps.length}
        value={current + 1}
        aria-valuetext={count}
      />
      <p className="sr-only">{count}</p>
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === current ? 'step' : undefined}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden
              className={cn(
                'rounded-mark grid h-4 w-[var(--mark-width)] place-items-center',
                index < current && 'bg-ink',
                index === current && 'bg-accent',
                index > current && 'bg-rule',
              )}
            />
            {index < current ? <Icon icon={Check} className="text-ink-2" /> : null}
            <span
              className={textRole(
                index === current ? 'label' : 'body',
                cn('whitespace-nowrap', index === current ? 'text-ink' : 'text-ink-2'),
              )}
            >
              {step}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A flow's heading in the display face and the line under it; the page's one
 * `h1`. A heading in words also names the document ("Sign in · CiteLadder").
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
      {/* Takes focus by script (tabIndex -1) when a flow moves to a new step. */}
      <h1 id={id} tabIndex={-1} className={textRole('display', 'text-balance')}>
        {title}
      </h1>
      {sub ? <p className={textRole('body', 'text-ink-2')}>{sub}</p> : null}
    </header>
  );
}

/**
 * One flow screen's content: the heading and its line, then the body 24
 * below, then an optional line under it (`after`, the sign-in/sign-up
 * switch). No box: the column sits on the ground.
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
  /** The heading's id, when a flow moves focus to it; generated otherwise. */
  titleId?: string;
  sub?: ReactNode;
  icon?: LucideIcon;
  after?: ReactNode;
  children?: ReactNode;
}>) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  return (
    <div className="flex flex-col gap-[var(--workspace-gap)] pb-[var(--flow-gap)]">
      <section aria-labelledby={headingId} className="flex flex-col gap-[var(--workspace-gap)]">
        <FlowHead id={headingId} title={title} sub={sub} icon={icon} />
        {children}
      </section>
      {after ? <p className={textRole('body', 'text-ink-2')}>{after}</p> : null}
    </div>
  );
}

/**
 * One step of a multi-step flow: the heading and help, the step's body, and
 * Back (quiet) and the one primary action in a bar pinned to the window's
 * foot, so the action never moves between steps or scrolls out of reach. A
 * step with neither action (a step that is working) has no bar.
 */
export function FlowStep({
  title,
  titleId,
  help,
  back,
  next,
  children,
}: Readonly<{
  title: ReactNode;
  titleId?: string;
  help?: ReactNode;
  /** A StepBack, or a quiet link; leave out on the first step. */
  back?: ReactNode;
  /** The step's primary Button. */
  next?: ReactNode;
  children: ReactNode;
}>) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  return (
    <div className="flex flex-1 flex-col">
      <section
        aria-labelledby={headingId}
        className="flex flex-1 flex-col gap-[var(--workspace-gap)] pb-[var(--flow-gap)]"
      >
        <FlowHead id={headingId} title={title} sub={help} />
        <div className="flex min-w-0 flex-col gap-[var(--card-padding)]">{children}</div>
      </section>
      {back || next ? (
        <footer className="bg-ground border-rule sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t py-3">
          {back ?? <span />}
          <span className="flex justify-end">{next}</span>
        </footer>
      ) : null}
    </div>
  );
}

/** A step's fields or groups of answers, one under the other in the flow's column. */
export function StepColumns({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid min-w-0 items-start gap-[var(--workspace-gap)]">{children}</div>;
}

/** What a working step has found so far: a label over a wrapping run of tags. */
export function StepFindings({
  title,
  items,
}: Readonly<{ title: string; items: readonly string[] }>) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={textRole('subheading')}>{title}</h2>
      <ul className="flex min-w-0 flex-wrap gap-1">
        {items.map((item, index) => (
          <li key={`${index}:${item}`}>
            <Tag>{item}</Tag>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Back: the quiet button with its chevron. */
export function StepBack({
  children = 'Back',
  ...props
}: Readonly<Omit<ButtonProps, 'variant' | 'className' | 'asChild'>>) {
  return (
    <Button {...props} variant="quiet">
      <Icon icon={ChevronLeft} />
      {children}
    </Button>
  );
}
