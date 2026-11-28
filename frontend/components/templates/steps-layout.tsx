import { useEffect, useRef, type ReactNode } from 'react';

import {
  RouteFill,
  StepsBody,
  StepsNav,
  StepsRowMark,
  StepsScroller,
} from '@/components/ui/record-chrome';
import { Pressable } from '@/components/ui/pressable';
import { FloatingBar } from '@/components/ui/selection-dock';
import { SidebarRowFace, SidebarRowLabel } from '@/components/ui/sidebar';
import { ToneGlyph } from '@/components/ui/status-mark';

type StepItem<T extends string> = Readonly<{ value: T; label: string }>;

export function StepsLayout<T extends string>({
  label,
  steps,
  current,
  onStep,
  note,
  narrow = false,
  footerStart,
  footerEnd,
  children,
}: Readonly<{
  label: string;
  steps: readonly StepItem<T>[];
  current: T;
  onStep: (step: T) => void;
  note?: ReactNode;
  narrow?: boolean;
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
        <StepsBody label={steps[index]?.label} narrow={narrow}>
          {children}
        </StepsBody>
      </StepsScroller>
      <FloatingBar place="flow" data-page-band="action-bar">
        {footerStart}
        {footerEnd}
      </FloatingBar>
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
        {done ? <ToneGlyph tone="positive" size="md" /> : position + 1}
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
