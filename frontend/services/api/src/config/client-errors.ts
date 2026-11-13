/**
 * Browser reports. The per-client rate limits live with the other abuse
 * budgets (`client_error_*`, `csp_report_*`); the field lengths are the wire
 * contract's (`@citeladder/contracts/client-errors`).
 */
export const clientErrors = {
  /** Larger than any report the contract's field lengths allow, far below the API-wide cap. */
  max_body_bytes: 16384,
  /** A full Reporting API batch of policy violations, far below the API-wide cap. */
  max_csp_body_bytes: 65536,
  /** The logger whose records Cloud Logging collects for client failures. */
  logger: 'api.client_errors',
} as const;
