import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    theme: { radius: ['mark', 'control', 'card', 'overlay'] },
    classGroups: {
      'font-weight': [{ font: ['emphasis', 'plain'] }],
      'font-family': [{ font: ['figure'] }],
      'font-size': [
        {
          text: [
            'caption',
            'caption-strong',
            'code',
            'data',
            'eyebrow',
            'screen-eyebrow',
            'screen-label',
            'kicker',
            'body',
            'body-lg',
            'label',
            'site-body',
            'prose',
            'heading',
            'title-sm',
            'page-title',
            'lead',
            'title',
            'heading-lg',
            'figure',
            'display-sm',
            'display',
            'display-md',
            'stat',
            'display-lg',
            'figure-xl',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ownValue<V>(table: Readonly<Record<string, V>>, key: string): V | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOneOf<T extends string | number>(
  allowed: readonly T[],
  value: unknown,
): value is T {
  return allowed.some((item) => item === value);
}

export function emailInitials(email: string) {
  const local = email.split('@')[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

export function sentenceCaseStatus(status: string): string {
  const words = status.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
