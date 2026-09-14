/**
 * Contract-drift CLI configuration. This module is Node-only and must not be
 * imported by browser application code.
 */
export const CONTRACT_BACKEND_ORIGIN =
  process.env.CONTRACT_BACKEND_ORIGIN?.trim() || 'http://localhost:8000';
export const CONTRACT_LIVE_FETCH_TIMEOUT_MS = 2_000;
export const CONTRACT_CODEGEN_TIMEOUT_MS = 120_000;
