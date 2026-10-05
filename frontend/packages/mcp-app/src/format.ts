export const rate = (value: unknown) =>
  typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'Unavailable';
