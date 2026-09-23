import { expect, it } from 'vite-plus/test';

import { safePageUrl } from '@/lib/demand/signals';
import { safeExternalUrl } from './urls';

it('accepts only absolute HTTP links while preserving each caller’s string contract', () => {
  const raw = '  HTTPS://EXAMPLE.COM/a  ';
  expect(safePageUrl(raw)).toBe('HTTPS://EXAMPLE.COM/a');
  expect(safeExternalUrl(raw)).toBe('https://example.com/a');
  for (const unsafe of [
    '//example.com/a',
    '/relative',
    'javascript:alert(1)',
    'data:text/html,hi',
  ]) {
    expect(safePageUrl(unsafe)).toBeNull();
    expect(safeExternalUrl(unsafe)).toBeNull();
  }
});
