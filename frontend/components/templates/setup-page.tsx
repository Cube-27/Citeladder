import { Check, ChevronLeft } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { FlowLogo } from '@/components/templates/flow-page';
import { FLOW_CARD } from '@/components/templates/notice-page';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { RungTrail } from '@/components/ui/rung-trail';
import { Tag } from '@/components/ui/tag';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The column a step and its action rail share: `max-w-thread` for a step with
 * several fields, `max-w-prose` for a one-field step, centred in the gutter.
 */
const STEP_COLUMN = {
  wide: 'max-w-thread mx-auto w-full px-[var(--content-gutter)]',
  narrow: 'max-w-prose mx-auto w-full px-[var(--content-gutter)]',
} as const;

type StepWidth = keyof typeof STEP_COLUMN;

/**
 * Workspace and project setup across the whole viewport: a top rail pinned
 * while the page scrolls, with the logo, the steps in the centre (a numbered
 * stepper; "Step n of N" on phones) and the way out, account menu and theme
 * switch at the right. A rule along the rail's foot fills as steps complete.
 * The steps' controls take the website's height (`control-lg`).
 */
export function SetupPage({
  label,
  steps,
  current = 0,
  barEnd,
  children,
}: Readonly<{
  /** The main landmark's name. */
  label: string;
  /** The setup's steps; leave out for a one-screen setup. */
  steps?: readonly [string, ...string[]];
  /** 0-based. */
  current?: number;
  barEnd?: ReactNode;
  children: ReactNode;
}>) {
  const index = steps ? Math.max(0, Math.min(steps.length - 1, current)) : 0;
  return (
    <div className="bg-ground text-ink flex min-h-dvh flex-col antialiased">
      <header className="border-rule bg-ground sticky top-0 z-10 border-b">
        <div className="grid min-h-[var(--masthead-height)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-[var(--content-gutter)]">
          <span className="inline-flex">
            <FlowLogo />
          </span>
          {steps ? <SetupStepper steps={steps} current={index} /> : <span />}
          <div className="flex items-center justify-end gap-2">
            {barEnd}
            <ThemeSwitch />
          </div>
        </div>
        {steps ? (
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-0.5">
            <span
              className="bg-ink block h-full"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </div>
        ) : null}
      </header>
      <main
        id="main"
        aria-label={label}
        className="flex flex-1 flex-col [--control-md:var(--control-lg)]"
      >
        {children}
      </main>
    </div>
  );
}

/**
 * The steps in the top rail: from `desktop:` each step's numbered mark (a
 * check when done, the current one ringed) and label, joined by short rules;
 * below it, "Step n of N". The current step is `aria-current="step"`, and the
 * count is a native progress bar named by the current step.
 */
function SetupStepper({
  steps,
  current,
}: Readonly<{ steps: readonly [string, ...string[]]; current: number }>) {
  const count = `Step ${current + 1} of ${steps.length}`;
  return (
    <section aria-label="Setup progress" className="flex min-w-0 justify-center">
      <progress
        className="sr-only"
        aria-label={steps[current]}
        max={steps.length}
        value={current + 1}
        aria-valuetext={count}
      />
      <p aria-hidden className={textRole('caption', 'desktop:hidden truncate')}>
        {count}
      </p>
      <p className="sr-only">{count}</p>
      <ol className="desktop:flex hidden items-center gap-3">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === current ? 'step' : undefined}
            className="flex items-center gap-2"
          >
            {index > 0 ? (
              <span
                aria-hidden
                className={cn('h-px w-10', index <= current ? 'bg-ink' : 'bg-rule')}
              />
            ) : null}
            <StepMark index={index} current={current} />
            <span
              className={textRole(
                index === current ? 'label' : 'body',
                cn('whitespace-nowrap', index > current ? 'text-ink-2' : 'text-ink'),
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

const MARK = 'grid size-6 shrink-0 place-items-center rounded-full';

/** A done step's check on ink, the current step's ringed number, a later step's muted one. */
function StepMark({ index, current }: Readonly<{ index: number; current: number }>) {
  if (index < current) {
    return (
      <span aria-hidden className={cn(MARK, 'bg-ink text-surface')}>
        <Check className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={textRole(
        'caption',
        cn(
          MARK,
          'border',
          index === current ? 'border-control-line text-ink' : 'border-rule text-ink-2',
        ),
      )}
    >
      {index + 1}
    </span>
  );
}

/**
 * One setup step in a centred column: the heading and help, then the step's
 * body in one card across the column, laid out with StepColumns so a desktop
 * step reads across the width. Back and the one primary sit in a rail pinned
 * to the viewport's foot; a step with neither action (one that is working)
 * has no rail.
 */
export function SetupStep({
  title,
  titleId,
  help,
  back,
  next,
  width = 'wide',
  children,
}: Readonly<{
  title: ReactNode;
  /** The heading's id, so the flow can move focus to it on a new step. */
  titleId?: string;
  help?: ReactNode;
  /** A StepBack, or a quiet link; leave out on the first step. */
  back?: ReactNode;
  /** The step's primary Button. */
  next?: ReactNode;
  /** `narrow` for a step with a single field. */
  width?: StepWidth;
  children: ReactNode;
}>) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  useDocumentTitle(typeof title === 'string' ? title : undefined);
  return (
    <div className="flex flex-1 flex-col">
      <div className={cn(STEP_COLUMN[width], 'flex flex-1 flex-col gap-4 py-6')}>
        <header className="flex flex-col gap-2">
          {/* Takes focus by script (tabIndex -1) when the flow moves to a new step. */}
          <h1 id={headingId} tabIndex={-1} className={textRole('title', 'text-balance')}>
            {title}
          </h1>
          {help ? <p className={textRole('body', 'text-ink-2')}>{help}</p> : null}
        </header>
        <section
          aria-labelledby={headingId}
          className={cn(FLOW_CARD, 'flex min-w-0 flex-col gap-[var(--card-padding)]')}
        >
          {children}
        </section>
      </div>
      {back || next ? (
        <footer className="border-rule bg-ground sticky bottom-0 z-10 border-t">
          <div className={cn(STEP_COLUMN[width], 'flex items-center justify-between gap-3 py-3')}>
            {back ?? <span />}
            <span className="flex justify-end">{next}</span>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

/** Two top-aligned columns from `desktop:` (one below it), for fields or groups of answers. */
export function StepColumns({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="desktop:grid-cols-2 grid min-w-0 items-start gap-[var(--card-padding)]">
      {children}
    </div>
  );
}

/** A working step's progress: the large RungTrail, 16px labels 12 apart. */
export function StepTrail(props: Readonly<Omit<ComponentProps<typeof RungTrail>, 'size'>>) {
  return <RungTrail {...props} size="lg" />;
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
