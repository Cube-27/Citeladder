import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { LogoMark } from '@/components/ui/logo-mark';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { websiteHref } from '@/lib/config/app-link';
import { cn } from '@/lib/utils';

export function FlowBar({
  center,
  progress,
  end,
  sticky = false,
}: Readonly<{
  center?: ReactNode;
  progress?: Readonly<{ step: number; of: number }>;
  end?: ReactNode;
  sticky?: boolean;
}>) {
  return (
    <header
      className={cn('shrink-0', sticky && 'border-rule bg-ground z-raised sticky top-0 border-b')}
    >
      <div className="min-h-masthead px-gutter grid-cols-lead-body-end grid items-center gap-4">
        <a
          href={websiteHref('/')}
          aria-label="CiteLadder home"
          className="focus-ring text-ink rounded-control -ms-1 inline-flex justify-self-start p-1"
        >
          <LogoMark size={22} />
        </a>
        {center ?? <span />}
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

export function FlowFooter({ children }: Readonly<{ children: ReactNode }>) {
  return <footer className="text-caption text-ink-2 px-gutter py-4 text-center">{children}</footer>;
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
