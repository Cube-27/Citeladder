import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { EXECUTION_STATES } from '@/lib/runs/status';
import { pageStatusBadgeValue } from '@/lib/site-health/status';
import { competitorState } from '@/components/products/commerce-format';
import { StatusMark } from './status-mark';

type Case = [
  label: string,
  props: Omit<ComponentProps<typeof StatusMark>, 'children'>,
  tone: string,
];

const CASES: readonly Case[] = [
  ['run completed', { variant: 'run-status', value: 'completed' }, 'positive'],
  ['run running', { variant: 'run-status', value: 'running' }, 'info'],
  ['run cancelled', { variant: 'run-status', value: 'cancelled' }, 'warning'],
  ['run failed', { variant: 'run-status', value: 'failed' }, 'negative'],
  ['severity critical', { variant: 'severity', value: 'critical' }, 'negative'],
  ['severity info', { variant: 'severity', value: 'info' }, 'neutral'],
  ['sentiment mixed', { variant: 'sentiment', value: 'mixed' }, 'warning'],
  ['classification owned', { variant: 'classification', value: 'owned' }, 'you'],
  ['priority low', { variant: 'priority', value: 'low' }, 'neutral'],
  ['execution succeeded', { tone: EXECUTION_STATES.succeeded.badge }, 'positive'],
  ['execution cancelled', { tone: EXECUTION_STATES.cancelled.badge }, 'negative'],
  ['page blocked', { tone: pageStatusBadgeValue('blocked') }, 'negative'],
  ['page completed', { tone: pageStatusBadgeValue('completed') }, 'positive'],
  ['competitor approved', { tone: competitorState('approved').tone }, 'positive'],
  ['competitor excluded', { tone: competitorState('excluded').tone }, 'negative'],
  ['no tone', {}, 'neutral'],
];

describe('StatusMark', () => {
  it.each(CASES)('maps %s to one tone vocabulary', (label, props, tone) => {
    render(<StatusMark {...props}>{label}</StatusMark>);
    expect(screen.getByText(label).closest('[data-status-tone]')).toHaveAttribute(
      'data-status-tone',
      tone,
    );
  });
});
