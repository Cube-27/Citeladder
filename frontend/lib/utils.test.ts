import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { cn } from './utils';

const THEME = readFileSync(join(import.meta.dirname, '../apps/app/src/globals.css'), 'utf8');
const roles = (namespace: string) => [
  ...new Set(
    [...THEME.matchAll(new RegExp(`--${namespace}-([a-z][a-z0-9-]*):`, 'gu'))].map(
      (match) => match[1]!,
    ),
  ),
];

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

  it('knows every spacing, motion, layer, opacity and template role the theme declares', () => {
    const unmerged = [
      ...roles('spacing').map((role) => [`gap-${role}`, 'gap-0', 'gap-0']),
      ...roles('transition-duration').map((role) => [
        `duration-${role}`,
        'duration-0',
        'duration-0',
      ]),
      ...roles('z-index').map((role) => [`z-${role}`, 'z-0', 'z-0']),
      ...roles('opacity').map((role) => [`opacity-${role}`, 'opacity-0', 'opacity-0']),
      ...roles('grid-template-columns').map((role) => [
        `grid-cols-${role}`,
        'grid-cols-2',
        'grid-cols-2',
      ]),
    ].filter(([role, step, merged]) => cn(role!, step!) !== merged);
    expect(roles('spacing')).toContain('workspace');
    expect(unmerged).toEqual([]);
  });
});
