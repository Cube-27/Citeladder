import { describe, expect, it } from 'vite-plus/test';

import { cn } from './utils';

describe('cn', () => {
  it("lets a caller's named radius replace a primitive's, and keeps a type role beside a colour or weight", () => {
    expect(cn('bg-well rounded-mark', 'rounded-card')).toBe('bg-well rounded-card');
    expect(cn('rounded-mark', 'rounded-full')).toBe('rounded-full');
    expect(cn('text-body', 'text-negative')).toBe('text-body text-negative');
    expect(cn('text-caption-strong font-sans', 'text-ink-2 font-emphasis')).toBe(
      'text-caption-strong font-sans text-ink-2 font-emphasis',
    );
    expect(cn('text-site-body', 'text-caption')).toBe('text-caption');
    expect(cn('font-plain', 'font-emphasis')).toBe('font-emphasis');
    expect(cn('text-figure font-figure text-ink', 'font-emphasis')).toBe(
      'text-figure font-figure text-ink font-emphasis',
    );
    expect(cn('font-sans', 'font-figure')).toBe('font-figure');
    expect(cn('text-kicker text-ink-2', 'text-screen-eyebrow')).toBe(
      'text-ink-2 text-screen-eyebrow',
    );
  });

  it('lets a caller replace a primitive role value with another role or a step', () => {
    expect(cn('min-h-control-md px-control-x', 'px-0')).toBe('min-h-control-md px-0');
    expect(cn('gap-compact', 'gap-workspace')).toBe('gap-workspace');
    expect(cn('h-control-md w-control-md', 'size-6')).toBe('size-6');
    expect(cn('duration-fast ease-standard', 'duration-open ease-fluid')).toBe(
      'duration-open ease-fluid',
    );
    expect(cn('z-raised', 'z-base')).toBe('z-base');
    expect(cn('max-w-flow', 'pt-flow-gap')).toBe('max-w-flow pt-flow-gap');
  });
});
