/** Deterministic code-unit order for persisted keys and IDs; never locale-sensitive. */
export function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}
