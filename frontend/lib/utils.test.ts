import { describe, expect, it } from 'vitest';

import { cn, emailInitials } from './utils';

describe('cn', () => {
  it('merges conditional class names and resolves Tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy conditional class names', () => {
    const isHidden = false;
    expect(cn('text-sm', isHidden && 'hidden', 'font-bold')).toBe('text-sm font-bold');
  });

  it('keeps the custom size rungs independent of text colours', () => {
    // tailwind-merge classifies an unrecognised `text-*` class as a colour, so
    // the ADS ladder's named rungs must be registered as sizes — otherwise the
    // colour utility silently eats the size (the text-hero score-ring defect).
    expect(cn('font-semibold', 'text-heading-sm', 'text-score-high-text')).toBe(
      'font-semibold text-heading-sm text-score-high-text',
    );
    expect(cn('text-hero', 'text-score-good-text')).toBe('text-hero text-score-good-text');
    // Every website rung, not a sample: an unregistered one is invisible in
    // review (the class is right there in the source) and silently renders at
    // the inherited size — which is how every subpage headline once shipped at
    // 14px instead of its rung.
    for (const rung of [
      'text-mkt-dxl',
      'text-mkt-d404',
      'text-mkt-h1',
      'text-mkt-h2',
      'text-mkt-h3',
      'text-mkt-h4',
      'text-mkt-h5',
      'text-mkt-h6',
      'text-mkt-h2sm',
      'text-mkt-h3sm',
      'text-mkt-h4sm',
      'text-mkt-hsm',
      'text-mkt-lead',
      'text-mkt-body',
      'text-mkt-button',
      'text-mkt-nav',
      'text-mkt-sm',
      'text-mkt-xs',
      'text-mkt-xsb',
      'text-mkt-xl-display',
    ]) {
      expect(cn(rung, 'text-mkt-ink'), `${rung} was eaten by the colour`).toBe(
        `${rung} text-mkt-ink`,
      );
    }
    // …while two sizes still conflict normally (later wins).
    expect(cn('text-heading-sm', 'text-lg')).toBe('text-lg');
  });
});

describe('emailInitials', () => {
  it('takes the first two characters of the local part, upper-cased', () => {
    expect(emailInitials('test.user@example.test')).toBe('TE');
    expect(emailInitials('jo@example.com')).toBe('JO');
  });

  it('uses a single-character local part as-is', () => {
    expect(emailInitials('a@example.com')).toBe('A');
  });

  it('falls back to the raw value when there is no @', () => {
    expect(emailInitials('root')).toBe('RO');
  });

  it('returns an empty string for an empty input', () => {
    expect(emailInitials('')).toBe('');
  });
});
