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
  'label-column',
  'quote-grid',
  'notice-fill',
  'turn-estimate',
  'count-mark',
  'title-line',
  'page-start',
  'page-strip',
  'bar-clearance',
  'rail-top',
  'route-fill',
  'thread-fill',
  'flow-top',
  'nav-count',
  'rung-figure',
  'indent',
  'indent-2',
  'ledger-label',
  'filter-search',
  'open-row-bleed',
  'notice-body',
  'viewport-fit',
  'drawer-fit',
  'dialog-fit',
  'dialog-max',
  'dialog-top',
  'dialog-top-max',
  'showcase-fill',
  'menu-wide',
  'menu-rule-inset',
  'dock-chip',
  'dock-menu',
  'turnstile',
  'turnstile-compact',
  'field-rows-min',
  'field-rows-max',
  'composer-rows-min',
  'composer-rows-max',
  'table-rows',
  'table-fit',
  'cell-indent',
  'cell-indent-2',
  'heat-floor',
  'heat-floor-phone',
  'rank-floor',
  'masthead-offset',
  'toast-top',
  'menu-max',
  'menu-trigger',
  'select-max',
  'select-trigger',
  'select-public',
  'state-title',
  'state-action',
  'figure-line',
  'body-line',
  'share',
  'offset',
  'tip-x',
  'tip-y',
  'place-top',
  'place-right',
  'place-bottom',
  'place-left',
  'place-width',
  'floor',
];

const DURATION_ROLES = [
  'fast',
  'close',
  'open',
  'press',
  'slide',
  'reveal',
  'pulse',
  'sweep',
  'menu-step',
  'reveal-step',
];

const TRANSITION_ROLES = [
  'field',
  'underline',
  'underline-color',
  'tint',
  'edge',
  'track',
  'fill',
  'size',
];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['mark', 'inner', 'control', 'card', 'overlay'],
      spacing: SPACING_ROLES,
      container: ['bubble', 'state', 'chart-key', 'list-wide'],
      shadow: ['tab-rule'],
      ease: ['standard', 'resize', 'fluid', 'quad', 'menu', 'sweep'],
    },
    classGroups: {
      duration: [{ duration: DURATION_ROLES }],
      transition: [{ transition: TRANSITION_ROLES }],
      opacity: [{ opacity: ['disabled', 'muted', 'dim', 'ghost', 'hover'] }],
      z: [
        { z: ['behind', 'base', 'raised', 'sticky', 'float', 'overlay', 'modal', 'toast', 'skip'] },
      ],
      'grid-cols': [
        {
          'grid-cols': [
            'label-value',
            'fields-action',
            'lead-body-end',
            'lead-body',
            'record',
            'body-end',
            'body-field',
            'choices',
            'bar-figure',
            'offering-map',
            'quotes',
            'drawer-split',
            'main-aside',
            'aside-main',
            'shell',
            'shell-compact',
            'shell-rail',
            'meter-row',
            'score-gauge',
            'answer-aside',
            'editor',
            'cards',
            'facts',
            'rung',
            'reorder-row',
            'work-row',
            'work-row-phone',
            'work-row-wide',
            'list-row',
            'list-row-phone',
            'list-row-wide',
          ],
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
