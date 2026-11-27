import { useRef, useState, type ReactNode, type RefObject } from 'react';

import { StatusMark } from '@/components/ui/status-mark';
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
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={label}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          onSelect(file);
          event.currentTarget.value = '';
        }}
        className="focus-ring bg-panel text-ink file:bg-well file:text-ink text-body file:text-label rounded-control file:rounded-control block w-full border border-transparent px-2 py-2 file:me-2 file:border-0 file:px-2 file:py-1"
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
      <output className="text-body text-ink-2 flex items-center gap-3 empty:hidden">
        {counts ? (
          <>
            <span>
              Parsed <span className="text-ink">{counts.rows}</span> row
              {counts.rows === 1 ? '' : 's'}
              {fileName ? ` from ${fileName}` : ''}.
            </span>
            {counts.skipped > 0 ? ' ' : null}
            {counts.skipped > 0 ? (
              <StatusMark variant="status" value="danger">
                {counts.skipped} skipped
              </StatusMark>
            ) : null}
          </>
        ) : null}
      </output>
      {counts ? children : null}
    </>
  );
}
