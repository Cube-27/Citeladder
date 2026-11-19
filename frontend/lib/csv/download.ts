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
import { saveBlob } from '@/lib/download';

type CsvCell = string | number | null | undefined;

/**
 * RFC 4180 quoting: double the quotes, wrap anything that could be misread.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a quote as well. Those are
 * formula triggers in spreadsheet software, and a cited page title beginning
 * with one would otherwise be evaluated when the file is opened.
 */
function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  // A number is never a formula: "-12" must import as a negative number.
  if (typeof value === 'number') return String(value);
  const text = value;
  const risky = /^\s*[=+\-@]|^[\t\r\n]/.test(text);
  const body = risky ? `'${text}` : text;
  return /[",\n\r]/.test(body) ? `"${body.replaceAll('"', '""')}"` : body;
}

/** The serializer; its escaping rules are tested on the text, not through a download. */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

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
  const blob = new Blob([`﻿${toCsv(headers, rows)}`], {
    type: 'text/csv;charset=utf-8',
  });
  saveBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}
