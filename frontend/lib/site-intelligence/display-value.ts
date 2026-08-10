export function displayValue(value: Record<string, unknown>, fallback: string): string {
  if (typeof value.normalized_value === 'string') return value.normalized_value;
  if (typeof value.canonical_name === 'string') return value.canonical_name;
  return fallback;
}
