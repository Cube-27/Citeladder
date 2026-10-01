/**
 * Defensive readers for persisted page facts. Facts are replayed from JSON a
 * different extractor version (or the Python extractor) wrote, so a wrongly
 * shaped field contributes nothing rather than failing the page.
 */
import { record } from '../../db/json.ts';
import { scalarText } from '../../text-order.ts';

export type Facts = Record<string, unknown>;
export { record };
export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const records = (value: unknown) => list(value).map(record);
/** Scalar text, as stored; other shapes read as ''. */
export const text = (value: unknown) => scalarText(value);
/** Truthiness the way the extractor wrote it: empty strings, zero and null are false. */
export const truthy = (value: unknown) =>
  Array.isArray(value) ? value.length > 0 : Boolean(value) && value !== '0';
/** An integer count, or 0 when the value is not one. */
export function count(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}
export const textList = (value: unknown) => list(value).map(text);
