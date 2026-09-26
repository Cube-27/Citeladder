/**
 * The API error machine-code union (docs/api-error-contract.md).
 *
 * The vocabulary is exported from the Python config modules that own it
 * (`backend/scripts/export_ts_platform.py`), so a TypeScript owner can only
 * emit a code the backend declares, and CI fails when the two drift.
 */
import { API_ERROR_CODES, type ApiErrorCode } from './generated/error-codes.ts';

export type { ApiErrorCode };

const KNOWN_CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

/** Narrow a code read from an untyped source, such as the policy export. */
export function asApiErrorCode(value: string): ApiErrorCode {
  if (!KNOWN_CODES.has(value)) {
    throw new Error(`'${value}' is not a declared API error code`);
  }
  return value as ApiErrorCode;
}
