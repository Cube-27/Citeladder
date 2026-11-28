import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const SPACING_ROLES = [
  'band',
  'card',
  'item',
  'loose',
  'tight',
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
  'badge',
  'nav-icon',
  'nav-row-x',
  'sidebar-pad',
  'tray-frame',
  'tray-head-bottom',
  'tray-head-end',
  'tray-head-start',
  'tray-head-top',
  'check',
  'close',
  'shell-inset',
  'target',
  'workspace',
  'section-rail',
  'tray-inset',
  'popup-inset',
  'indent',
  'indent-2',
  'tray',
  'viewport-fit',
  'dialog-fit',
  'dialog-max',
  'body-line',
];

const DURATION_ROLES = ['fast', 'close', 'open', 'turn', 'slide'];

const TRANSITION_ROLES = ['field', 'tint', 'edge'];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['mark', 'inner', 'control', 'card', 'overlay', 'tray-item', 'popup-item'],
      spacing: SPACING_ROLES,
      container: ['bubble', 'row-wide'],
      ease: ['standard', 'fluid', 'menu', 'sweep'],
    },
    classGroups: {
      duration: [{ duration: DURATION_ROLES }],
      transition: [{ transition: TRANSITION_ROLES }],
      opacity: [{ opacity: ['disabled', 'muted'] }],
      z: [{ z: ['behind', 'base', 'raised', 'sticky', 'overlay', 'modal'] }],
      'grid-cols': [
        {
          'grid-cols': ['label-value', 'lead-body-end'],
        },
      ],
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
  const options: readonly unknown[] = allowed;
  return options.includes(value);
}

export function emailInitials(email: string) {
  const local = email.split('@')[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

export function sentenceCaseStatus(status: string): string {
  const words = status.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
