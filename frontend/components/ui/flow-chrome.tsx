import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { FlowLogo } from '@/components/ui/flow-logo';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { Check } from '@/lib/icons';
import { cn } from '@/lib/utils';

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
        <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-0.5">
          {Array.from({ length: progress.of }, (_, index) => (
            <span
              key={index}
              className={cn('h-full flex-1', index < progress.step && 'bg-primary')}
            />
          ))}
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
