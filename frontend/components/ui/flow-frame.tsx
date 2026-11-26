import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { FlowLogo } from '@/components/ui/flow-logo';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { Check } from '@/lib/icons';
import { cn } from '@/lib/utils';

const GROUND_LAYOUT = {
  block: undefined,
  grid: 'grid',
  column: 'flex flex-col',
} as const;

export function PageGround({
  layout = 'block',
  split = false,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'style'> & {
    layout?: keyof typeof GROUND_LAYOUT;
    split?: boolean;
  }
>) {
  return (
    <div
      {...props}
      className={cn(
        'text-ink min-h-dvh antialiased',
        GROUND_LAYOUT[layout],
        split ? 'bg-panel desktop:grid-cols-2' : 'bg-ground',
      )}
    >
      {children}
    </div>
  );
}

const FLOW_MAIN = {
  frame: 'max-w-flow px-gutter pt-flow-gap mx-auto w-full',
  page: 'max-w-flow px-gutter pb-flow-gap pt-flow-top controls-lg mx-auto flex w-full flex-1 flex-col',
} as const;

export function FlowMain({
  variant,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'main'>, 'className' | 'style'> & {
    variant: keyof typeof FLOW_MAIN;
  }
>) {
  return (
    <main {...props} className={FLOW_MAIN[variant]}>
      {children}
    </main>
  );
}

export function FlowBar({ end }: Readonly<{ end?: ReactNode }>) {
  return (
    <header className="min-h-masthead gap-card px-gutter flex shrink-0 items-center justify-between">
      <span className="inline-flex">
        <FlowLogo />
      </span>
      <div className="flex items-center gap-2">
        {end}
        <ThemeSwitch />
      </div>
    </header>
  );
}

export function FlowFooter({ children }: Readonly<{ children: ReactNode }>) {
  return <footer className="text-caption text-ink-2 px-gutter py-4 text-center">{children}</footer>;
}

const PROGRESS_WIDTH: Readonly<Record<string, string>> = {
  '1/2': 'w-1/2',
  '1/3': 'w-1/3',
  '2/3': 'w-2/3',
  '1/4': 'w-1/4',
  '2/4': 'w-2/4',
  '3/4': 'w-3/4',
  '1/5': 'w-1/5',
  '2/5': 'w-2/5',
  '3/5': 'w-3/5',
  '4/5': 'w-4/5',
  '1/6': 'w-1/6',
  '2/6': 'w-2/6',
  '3/6': 'w-3/6',
  '4/6': 'w-4/6',
  '5/6': 'w-5/6',
};

export function SetupBar({
  stepper,
  progress,
  end,
}: Readonly<{
  stepper: ReactNode;
  progress?: Readonly<{ step: number; of: number }>;
  end?: ReactNode;
}>) {
  return (
    <header className="border-rule bg-ground z-raised sticky top-0 border-b">
      <div className="min-h-masthead px-gutter grid-cols-lead-body-end grid items-center gap-4">
        <span className="inline-flex">
          <FlowLogo />
        </span>
        {stepper}
        <div className="flex items-center justify-end gap-2">
          {end}
          <ThemeSwitch />
        </div>
      </div>
      {progress ? (
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-0.5">
          <span
            className={cn(
              'bg-primary block h-full',
              progress.step >= progress.of
                ? 'w-full'
                : (PROGRESS_WIDTH[`${progress.step}/${progress.of}`] ?? 'w-full'),
            )}
          />
        </div>
      ) : null}
    </header>
  );
}

export function SetupMain({
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'main'>, 'className' | 'style'>>) {
  return (
    <main {...props} className="controls-lg flex flex-1 flex-col">
      {children}
    </main>
  );
}

const STEP_COLUMN = {
  wide: 'max-w-thread mx-auto w-full px-gutter',
  narrow: 'max-w-prose mx-auto w-full px-gutter',
} as const;

export type StepWidth = keyof typeof STEP_COLUMN;

export function StepBody({ width, children }: Readonly<{ width: StepWidth; children: ReactNode }>) {
  return (
    <div className={cn(STEP_COLUMN[width], 'flex flex-1 flex-col gap-4 py-6')}>{children}</div>
  );
}

export function StepFootBar({
  width,
  children,
}: Readonly<{ width: StepWidth; children: ReactNode }>) {
  return (
    <footer className="border-rule bg-ground z-raised sticky bottom-0 border-t">
      <div className={cn(STEP_COLUMN[width], 'flex items-center justify-between gap-3 py-3')}>
        {children}
      </div>
    </footer>
  );
}

export function StepConnector({ done }: Readonly<{ done: boolean }>) {
  return <span aria-hidden className={cn('h-px w-10', done ? 'bg-primary' : 'bg-rule')} />;
}

const MARK = 'grid size-6 shrink-0 place-items-center rounded-full';

export function SetupStepMark({ index, current }: Readonly<{ index: number; current: number }>) {
  if (index < current) {
    return (
      <span aria-hidden className={cn(MARK, 'bg-primary text-on-primary')}>
        <Check className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'text-caption',
        MARK,
        'border',
        index === current ? 'border-control-line text-ink' : 'border-rule text-ink-2',
      )}
    >
      {index + 1}
    </span>
  );
}
