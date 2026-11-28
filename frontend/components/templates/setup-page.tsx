import { useId, type ComponentProps, type ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import {
  FlowBar,
  SetupMain,
  StepBody,
  StepConnector,
  EdgeFootBar,
  type StepWidth,
} from '@/components/ui/flow-chrome';
import { PageGround } from '@/components/ui/flow-frame';
import { Icon } from '@/components/ui/icon';
import { Columns, Inline, Stack } from '@/components/ui/layout';
import { RungTrail } from '@/components/ui/rung-trail';
import { StepMark, stepState } from '@/components/ui/step-mark';
import { Section } from '@/components/ui/section';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/typography';
import { ChevronLeft } from '@/lib/icons';

import { FlowHead } from './flow-page';

export function SetupPage({
  label,
  steps,
  current = 0,
  barEnd,
  children,
}: Readonly<{
  label: string;
  steps?: readonly [string, ...string[]];
  current?: number;
  barEnd?: ReactNode;
  children: ReactNode;
}>) {
  const index = steps ? Math.max(0, Math.min(steps.length - 1, current)) : 0;
  return (
    <PageGround layout="column">
      <FlowBar
        sticky
        center={steps ? <SetupStepper steps={steps} current={index} /> : undefined}
        progress={steps ? { step: index + 1, of: steps.length } : undefined}
        end={barEnd}
      />
      <SetupMain id="main" aria-label={label}>
        {children}
      </SetupMain>
    </PageGround>
  );
}

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
      <Text as="p" variant="caption" wrap="truncate" hideOnDesktop aria-hidden>
        {count}
      </Text>
      <p className="sr-only">{count}</p>
      <Inline as="ol" gap="group" desktopOnly>
        {steps.map((step, index) => (
          <Inline as="li" key={step} aria-current={index === current ? 'step' : undefined}>
            {index > 0 ? <StepConnector done={index <= current} /> : null}
            <StepMark state={stepState(index, current)} number={index + 1} />
            <Text
              variant={index === current ? 'label' : 'body'}
              tone={index > current ? 'ink-2' : 'ink'}
              wrap="nowrap"
            >
              {step}
            </Text>
          </Inline>
        ))}
      </Inline>
    </section>
  );
}

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
  titleId?: string;
  help?: ReactNode;
  back?: ReactNode;
  next?: ReactNode;
  width?: StepWidth;
  children: ReactNode;
}>) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  return (
    <div className="flex flex-1 flex-col">
      <StepBody width={width}>
        <FlowHead id={headingId} title={title} sub={help} />
        <Section aria-labelledby={headingId}>{children}</Section>
      </StepBody>
      {back || next ? (
        <EdgeFootBar width={width}>
          {back ?? <span />}
          <span className="flex justify-end">{next}</span>
        </EdgeFootBar>
      ) : null}
    </div>
  );
}

export function StepColumns({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Columns template="halves-desktop" gap="card" align="start">
      {children}
    </Columns>
  );
}

export function StepTrail(props: Readonly<Omit<ComponentProps<typeof RungTrail>, 'size'>>) {
  return <RungTrail {...props} size="lg" />;
}

export function StepFindings({
  title,
  items,
}: Readonly<{ title: string; items: readonly string[] }>) {
  return (
    <Stack as="section" gap="item">
      <Text as="h2" variant="label">
        {title}
      </Text>
      <Inline as="ul" gap="tight" align="stretch" wrap>
        {items.map((item, index) => (
          <li key={`${index}:${item}`}>
            <Tag>{item}</Tag>
          </li>
        ))}
      </Inline>
    </Stack>
  );
}

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
