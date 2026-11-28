import { z } from 'zod';

function isoDayDate(isoDay: string): Date | null {
  const date = new Date(`${isoDay}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isIsoDay(value: string): boolean {
  return z.iso.date().safeParse(value).success;
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addIsoDays(isoDay: string, days: number): string {
  const date = isoDayDate(isoDay);
  if (!date) return isoDay;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatWeekdayDate({
  isoDay,
  weekday,
  today,
}: Readonly<{ isoDay: string; weekday: 'long' | 'short'; today?: string }>): string {
  const date = isoDayDate(isoDay);
  if (!date) return isoDay;
  const otherYear = today !== undefined && isoDay.slice(0, 4) !== today.slice(0, 4);
  return date.toLocaleDateString('en-US', {
    weekday,
    month: 'short',
    day: 'numeric',
    ...(otherYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}
