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
  });
});
