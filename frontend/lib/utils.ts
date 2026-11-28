import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import { MERGE_ROLES } from '@/lib/merge-roles.gen';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: MERGE_ROLES.radius,
      spacing: MERGE_ROLES.spacing,
      container: MERGE_ROLES.container,
      ease: MERGE_ROLES.ease,
    },
    classGroups: {
      duration: [{ duration: MERGE_ROLES.duration }],
      transition: [{ transition: MERGE_ROLES.transition }],
      opacity: [{ opacity: MERGE_ROLES.opacity }],
      z: [{ z: MERGE_ROLES.z }],
      'grid-cols': [{ 'grid-cols': MERGE_ROLES.gridCols }],
      'font-weight': [{ font: MERGE_ROLES.fontWeight }],
      'font-family': [{ font: MERGE_ROLES.fontFamily }],
      'font-size': [{ text: MERGE_ROLES.fontSize }],
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
