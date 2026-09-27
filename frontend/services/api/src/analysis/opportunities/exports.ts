import { pyFloatRepr, pyReprValue } from '../../python/text.ts';
const columns = [
  'id',
  'rule_id',
  'opportunity_type',
  'severity',
  'priority_score',
  'title',
  'target',
  'remediation',
  'rule_version',
  'formula_version',
  'created_at',
];
// A float column's decoded number has no float tag; Python prints its whole values as `30.0`.
const floatColumns = new Set(['priority_score']);
function cell(value: unknown, column: string): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'number' && floatColumns.has(column)
        ? pyFloatRepr(value)
        : typeof value === 'boolean'
          ? String(value)
          : typeof value === 'object'
            ? pyReprValue(value)
            : String(value);
  return /^[\t\r\n]/u.test(text) || /^[ \t\r\n\v\f]*[=+@-]/u.test(text) ? `'${text}` : text;
}
export function rowsToCsv(items: Record<string, unknown>[]): string {
  const quote = (text: string) =>
    /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  return (
    [
      columns.join(','),
      ...items.map((item) => columns.map((c) => quote(cell(item[c], c))).join(',')),
    ].join('\r\n') + '\r\n'
  );
}
export function rowsToMarkdown(items: Record<string, unknown>[]): string {
  const escape = (value: unknown, column: string) =>
    cell(value, column)
      .replaceAll('\\', '\\\\')
      .replaceAll('|', '\\|')
      .replaceAll('\n', ' ')
      .replaceAll('\r', ' ');
  return [
    '# CiteLadder — Opportunities',
    '',
    `| ${columns.join(' | ')} |`,
    `|${columns.map(() => '---').join('|')}|`,
    ...items.map((item) => `| ${columns.map((c) => escape(item[c], c)).join(' | ')} |`),
    '',
  ].join('\n');
}
