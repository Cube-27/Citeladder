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
    expect(cn('text-mkt-d2', 'text-mkt-ink')).toBe('text-mkt-d2 text-mkt-ink');
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
