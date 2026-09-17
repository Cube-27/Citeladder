/**
 * Handing the reader the table they are looking at, as a file.
 *
 * The counterpart to `lib/prompts/csv`, which parses a file someone uploads.
 * Kept separate from it because the two share no code and only one of them is
 * allowed to touch the DOM.
 *
 * What is exported is what the current filter, search and sort produced, in the
 * order it is on screen. An export that quietly widened to the unfiltered set
 * would be a different answer to the one the reader asked for.
 */

/**
 * RFC 4180 quoting: double the quotes, wrap anything that could be misread.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a quote as well. Those are
 * formula triggers in spreadsheet software, and a cited page title beginning
 * with one would otherwise be evaluated when the file is opened.
 */
function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const risky = /^[=+\-@\t\r]/.test(text);
  const body = risky ? `'${text}` : text;
  return /[",\n\r]/.test(body) ? `"${body.replaceAll('"', '""')}"` : body;
}

function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/**
 * The serializer, exposed for its own tests.
 *
 * `downloadCsv` is the module's real entry point and it touches the DOM, so
 * the escaping rules — the part with the failure modes — are asserted on the
 * text directly rather than through a stubbed anchor click.
 */
export const toCsvForTest = toCsv;

/**
 * Save the given rows as a CSV file.
 *
 * A BOM leads the file so Excel reads it as UTF-8; without it a publisher name
 * carrying an accent arrives mojibake'd, which is the one thing an export is
 * supposed to survive.
 */
export function downloadCsv(
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([`﻿${toCsv(headers, rows)}`], {
    type: 'text/csv;charset=utf-8',
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
