import { useRef, useState, type ReactNode, type RefObject } from 'react';

import { Input } from '@/components/ui/input';
import { Absence } from '@/components/ui/absence';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow } from '@/components/ui/table';
import { READ_FAILED_MESSAGE, readCsvFileText } from '@/lib/csv/read-file-text';

export function useCsvImportFile<T>(parse: (text: string) => T) {
  const [parsed, setParsed] = useState<T | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selection = useRef(0);

  const reset = () => {
    selection.current += 1;
    setParsed(null);
    setFileName(null);
    setReadError(null);
    setReading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    const current = ++selection.current;
    setFileName(file.name);
    setParsed(null);
    setReadError(null);
    setReading(true);
    let text: string;
    try {
      text = await readCsvFileText(file);
    } catch (cause) {
      if (current !== selection.current) return;
      setReadError(cause instanceof Error ? cause.message : READ_FAILED_MESSAGE);
      setReading(false);
      return;
    }
    if (current !== selection.current) return;
    setParsed(parse(text));
    setReading(false);
  };

  return { fileName, inputRef, parsed, readError, reading, reset, selectFile };
}

export function CsvImportFileInput({
  inputRef,
  onSelect,
  label = 'CSV file',
  accept = '.csv,text/csv',
}: Readonly<{
  inputRef?: RefObject<HTMLInputElement | null>;
  onSelect: (file: File | undefined) => void;
  label?: string;
  accept?: string;
}>) {
  return (
    <label className="grid gap-2">
      <span className="text-body text-ink-2">{label}</span>
      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={label}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          onSelect(file);
          event.currentTarget.value = '';
        }}
      />
    </label>
  );
}

export function CsvImportPreview({
  children,
  counts,
  fileName,
}: Readonly<{
  children: ReactNode;
  counts: Readonly<{ rows: number; skipped: number }> | null;
  fileName: string | null;
}>) {
  return (
    <>
      <output className="text-body text-ink-2 flex items-center gap-3 empty:sr-only">
        {counts ? (
          <>
            <span>
              Parsed <span className="text-ink">{counts.rows}</span> row
              {counts.rows === 1 ? '' : 's'}
              {fileName ? ` from ${fileName}` : ''}.
            </span>
            {counts.skipped > 0 ? ' ' : null}
            {counts.skipped > 0 ? (
              <StatusMark tone="negative">{counts.skipped} skipped</StatusMark>
            ) : null}
          </>
        ) : null}
      </output>
      {counts ? children : null}
    </>
  );
}

type PreviewRow = Readonly<{
  line: number;
  errors: readonly string[];
  input: { topic?: string | null };
}>;

export function CsvRowStatus({ errors }: Readonly<{ errors: readonly string[] }>) {
  if (errors.length > 0) return <StatusMark tone="negative">{errors.join(' ')}</StatusMark>;
  return <StatusMark tone="positive">Ready</StatusMark>;
}

export function CsvPreviewTable<R extends PreviewRow>({
  label,
  textLabel,
  rows,
  text,
  status = (row) => <CsvRowStatus errors={row.errors} />,
}: Readonly<{
  label: string;
  textLabel: string;
  rows: readonly R[];
  text: (row: R) => string;
  status?: (row: R) => ReactNode;
}>) {
  const columns: readonly DataTableColumn[] = [
    { key: 'line', label: 'Row', width: 'index', kind: 'number' },
    { key: 'topic', label: 'Topic', width: 'name' },
    { key: 'text', label: textLabel },
    { key: 'status', label: 'Status', width: 'category' },
  ];
  return (
    <DataTable label={label} columns={columns}>
      {rows.map((row) => (
        <TableRow key={row.line} dimmed={row.errors.length > 0}>
          <TableCell numeric tone="ink-2">
            {row.line}
          </TableCell>
          <TableCell>{row.input.topic || <Absence state="not_set" />}</TableCell>
          <TableCell>{text(row) || <Absence state="not_set" />}</TableCell>
          <TableCell>{status(row)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
