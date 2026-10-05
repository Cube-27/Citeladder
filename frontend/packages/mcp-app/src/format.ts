export const rate = (value: unknown) =>
  typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'Unavailable';

export const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;
