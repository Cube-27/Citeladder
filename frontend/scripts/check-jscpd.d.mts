export type Clone = {
  format: string;
  lines: number;
  tokens: number;
  firstFile: { name: string; start: number; end: number };
  secondFile: { name: string; start: number; end: number };
};

export type JscpdBaseline = {
  format_version: number;
  tool_version: string;
  scope: string[];
  production_percentage: number;
  clone_fingerprints: string[];
};

export type JscpdReport = {
  duplicates: Clone[];
  statistics: { total: { percentage?: number } };
};

export const TOOL_VERSION: string;
export const EXPECTED_SCOPE: string[];

export function cloneFingerprint(clone: Clone): string;
export function validateHistoricalBaseline(raw: JscpdBaseline): JscpdBaseline;
export function validateBaseline(raw: JscpdBaseline): JscpdBaseline;
export function readReport(reportPath: string): JscpdReport;
export function productionFailures(
  report: JscpdReport,
  baseline: JscpdBaseline,
  baseBaseline?: JscpdBaseline | null,
): string[];
