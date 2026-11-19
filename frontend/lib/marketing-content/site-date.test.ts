import { expect, it } from 'vite-plus/test';

import { formatSiteDate } from './site-date';

it.each([
  ['2026-11-07', '7 Nov 2026'],
  ['2026-09-30', '30 Sep 2026'],
  ['2026-10-14T23:30:00Z', '14 Oct 2026'],
  ['not a date', 'not a date'],
])('formats %s as %s', (input, expected) => {
  expect(formatSiteDate(input)).toBe(expected);
});
