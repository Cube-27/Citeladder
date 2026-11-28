import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Download, X } from '@/lib/icons';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import {
  CsvImportFileInput,
  CsvImportPreview,
  CsvPreviewTable,
  useCsvImportFile,
} from '@/components/ui/csv-import';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import type { PromptImportRowRequest } from '@citeladder/contracts/prompt-requests';
import { downloadCsv } from '@/lib/csv/download';
import {
  PROMPT_CSV_COLUMNS,
  PROMPT_CSV_SAMPLE_ROWS,
  parsePromptCsv,
  validRows,
  type ParsedCsv,
  type PromptCsvLimits,
} from '@/lib/prompts/csv';
import { Notice } from '@/components/ui/notice';

function downloadSample() {
  downloadCsv('prompts-sample.csv', PROMPT_CSV_COLUMNS, PROMPT_CSV_SAMPLE_ROWS);
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImport,
  isImporting,
  error,
  limits,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: PromptImportRowRequest[]) => Promise<void> | void;
  isImporting?: boolean;
  error?: MutationNoticeData;
  limits: PromptCsvLimits;
}>) {
  const { fileName, inputRef, parsed, readError, reading, reset, selectFile } =
    useCsvImportFile<ParsedCsv>((raw) => parsePromptCsv(raw, limits));

  const importable = useMemo(() => (parsed ? validRows(parsed) : []), [parsed]);
  const importNoun = importable.length === 1 ? 'prompt' : 'prompts';

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submitting = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const confirm = async () => {
    if (importable.length === 0 || submitting.current) return;
    submitting.current = true;
    setSubmitted(true);
    try {
      await onImport(importable);
    } finally {
      submitting.current = false;
      setSubmitted(false);
    }
  };
  const importing = Boolean(isImporting) || submitted;

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Import prompts from CSV"
      description="Columns: topic, prompt."
      width="wide"
      footer={
        <>
          <Button variant="quiet" onClick={() => handleOpenChange(false)}>
            <Icon icon={X} />
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={confirm}
            disabled={
              importing || reading || importable.length === 0 || Boolean(parsed?.errors.length)
            }
          >
            {importing ? 'Importing…' : `Import ${importable.length} ${importNoun}`}
          </Button>
        </>
      }
    >
      {error ? <Notice kind="mutation" notice={error} /> : null}

      <Stack gap="compact">
        <CsvImportFileInput inputRef={inputRef} onSelect={(file) => void selectFile(file)} />
        <Button variant="secondary" box="start" onClick={downloadSample}>
          <Icon icon={Download} />
          Download sample CSV
        </Button>
      </Stack>

      {readError ? <Notice tone="negative">{readError}</Notice> : null}

      {parsed && parsed.errors.length > 0 ? (
        <Notice tone="negative">{parsed.errors.join(' ')}</Notice>
      ) : null}

      <CsvImportPreview counts={parsedCounts(parsed)} fileName={fileName}>
        {parsed ? (
          <CsvPreviewTable
            label="Parsed rows"
            textLabel="Prompt"
            rows={parsed.rows}
            text={(row) => row.input.text}
          />
        ) : null}
      </CsvImportPreview>
    </Dialog>
  );
}

function parsedCounts(parsed: ParsedCsv | null) {
  if (!parsed?.rows.length) return null;
  return {
    rows: parsed.rows.length,
    skipped: parsed.rows.filter((row) => row.errors.length > 0).length,
  };
}
