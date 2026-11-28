import { describe, expect, it } from 'vite-plus/test';

import { addIsoDays, formatWeekdayDate, isIsoDay } from './iso-day';

describe('ISO days', () => {
  it('accepts only real calendar days and steps across month and leap-year ends', () => {
    expect(
      ['2026-02-28', '2028-02-29', '2026-02-30', '2026-13-01', '26-01-01'].map(isIsoDay),
    ).toEqual([true, true, false, false, false]);
    expect(addIsoDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addIsoDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addIsoDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('names the weekday and adds the year only when it differs from today’s', () => {
    expect(formatWeekdayDate({ isoDay: '2026-12-22', weekday: 'short', today: '2026-11-22' })).toBe(
      'Tue, Dec 22',
    );
    expect(formatWeekdayDate({ isoDay: '2027-02-20', weekday: 'short', today: '2026-11-22' })).toBe(
      'Sat, Feb 20, 2027',
    );
    expect(formatWeekdayDate({ isoDay: '2026-09-05', weekday: 'long' })).toBe('Saturday, Sep 5');
  });
});
