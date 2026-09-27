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
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value as string | number);
}
/** One cell's text, with spreadsheet formula injection neutralized. */
function cell(value: unknown): string {
  const text = cellText(value);
  return /^[\t\r\n]/u.test(text) || /^[ \t\r\n\v\f]*[=+@-]/u.test(text) ? `'${text}` : text;
}
export function rowsToCsv(items: Record<string, unknown>[]): string {
  const quote = (text: string) =>
    /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  return (
    [
      columns.join(','),
      ...items.map((item) => columns.map((c) => quote(cell(item[c]))).join(',')),
    ].join('\r\n') + '\r\n'
  );
}
export function rowsToMarkdown(items: Record<string, unknown>[]): string {
  const escape = (value: unknown) =>
    cell(value)
      .replaceAll('\\', '\\\\')
      .replaceAll('|', '\\|')
      .replaceAll('\n', ' ')
      .replaceAll('\r', ' ');
  return [
    '# CiteLadder — Opportunities',
    '',
    `| ${columns.join(' | ')} |`,
    `|${columns.map(() => '---').join('|')}|`,
    ...items.map((item) => `| ${columns.map((c) => escape(item[c])).join(' | ')} |`),
    '',
  ].join('\n');
}
