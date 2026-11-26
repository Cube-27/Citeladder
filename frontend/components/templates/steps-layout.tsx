import { useEffect, useRef, type ReactNode } from 'react';

import {
  ActionBar,
  RouteFill,
  StepsNav,
  StepsRowMark,
  StepsScroller,
} from '@/components/ui/page-chrome';
import { Pressable } from '@/components/ui/pressable';
import { SidebarRowFace, SidebarRowLabel } from '@/components/ui/sidebar';
import { Check } from '@/lib/icons';

export type StepItem<T extends string> = Readonly<{ value: T; label: string }>;

export function StepsLayout<T extends string>({
  label,
  steps,
  current,
  onStep,
  note,
  footerStart,
  footerEnd,
  children,
}: Readonly<{
  label: string;
  steps: readonly StepItem<T>[];
  current: T;
  onStep: (step: T) => void;
  note?: ReactNode;
  footerStart: ReactNode;
  footerEnd: ReactNode;
  children: ReactNode;
}>) {
  const index = steps.findIndex((step) => step.value === current);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active === document.body || active?.id === 'main')
      scroller.current?.focus({ preventScroll: true });
  }, []);
  return (
    <RouteFill>
      <StepsScroller ref={scroller}>
        <StepsNav label={label} note={note}>
          {steps.map((step, position) => (
            <li key={step.value}>
              <StepRow
                step={step}
                position={position}
                current={index}
                onStep={() => onStep(step.value)}
              />
            </li>
          ))}
        </StepsNav>
        <section aria-label={steps[index]?.label} className="min-w-0 flex-1">
          {children}
        </section>
      </StepsScroller>
      <ActionBar>
        {footerStart}
        <span className="flex-1" />
        {footerEnd}
      </ActionBar>
    </RouteFill>
  );
}

function StepRow<T extends string>({
  step,
  position,
  current,
  onStep,
}: Readonly<{ step: StepItem<T>; position: number; current: number; onStep: () => void }>) {
  const done = position < current;
  const face = (
    <>
      <StepsRowMark state={stepState(position, current)}>
        {done ? <Check className="size-3.5" /> : position + 1}
      </StepsRowMark>
      <SidebarRowLabel muted={position > current}>{step.label}</SidebarRowLabel>
    </>
  );
  if (done) {
    return (
      <SidebarRowFace asChild active={false}>
        <Pressable onClick={onStep}>
          {face}
          <span className="sr-only">(completed)</span>
        </Pressable>
      </SidebarRowFace>
    );
  }
  return (
    <SidebarRowFace
      active={position === current}
      still
      aria-current={position === current ? 'step' : undefined}
    >
      {face}
    </SidebarRowFace>
  );
}

function stepState(position: number, current: number) {
  if (position < current) return 'done';
  return position === current ? 'current' : 'next';
}
