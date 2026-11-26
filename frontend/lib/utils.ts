import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const SPACING_ROLES = [
  'band',
  'card',
  'cell-x',
  'cell-y',
  'chart-lg',
  'chart-md',
  'chart-sm',
  'compact',
  'control-coarse',
  'control-lg',
  'control-md',
  'control-sm',
  'control-x',
  'filter-bar',
  'flow-gap',
  'gutter',
  'mark',
  'masthead',
  'modal',
  'nav-row',
  'page-block',
  'page-end',
  'page-inline',
  'page-tabs',
  'page-top',
  'panel-inset',
  'rail-button',
  'row',
  'section',
  'sidebar',
  'sidebar-compact',
  'sidebar-rail',
  'table-head',
  'tag',
  'target',
  'workspace',
];

const DURATION_ROLES = [
  'tint',
  'fast',
  'normal',
  'close',
  'menu-blur',
  'open',
  'press',
  'slide',
  'toast',
  'reveal',
  'pulse',
  'sweep',
  'menu-step',
  'reveal-step',
];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['mark', 'control', 'card', 'overlay'],
      spacing: SPACING_ROLES,
      ease: ['standard', 'resize', 'fluid', 'quad', 'menu', 'sweep'],
    },
    classGroups: {
      duration: [{ duration: DURATION_ROLES }],
      z: [{ z: ['base', 'raised', 'sticky', 'overlay', 'modal', 'toast'] }],
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
