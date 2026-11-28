import type { BrandFactImportResult } from '@citeladder/contracts/fact-checking';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  CsvImportFileInput,
  CsvImportPreview,
  CsvPreviewTable,
  CsvRowStatus,
  useCsvImportFile,
} from '@/components/ui/csv-import';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { StatusMark } from '@/components/ui/status-mark';
import { useToast } from '@/components/ui/toast';
import { Download } from '@/lib/icons';
import { humanizeApiError } from '@/lib/api/errors';
import { projectMutations } from '@/lib/api/projects';
import { downloadCsv } from '@/lib/csv/download';
import { useProjectScope } from '@/lib/project/active-project-scope';
import {
  FACT_CSV_COLUMNS,
  FACT_CSV_SAMPLE_ROWS,
  parseFactCsv,
  type ParsedFactCsv,
  type ParsedFactRow,
} from '@/lib/project/facts-csv';
import { useBrandFacts } from '@/lib/project/use-brand-facts';
import { pluralCount } from '@/lib/format';

type Outcome = BrandFactImportResult['rows'][number];

export function FactsImportDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { notify } = useToast();
  const importing = useMutation(projectMutations.importBrandFacts(useProjectScope()));
  const [outcomes, setOutcomes] = useState<Map<number, Outcome> | null>(null);
  const maxRows = useBrandFacts().data?.limits.facts_import_max_rows ?? null;
  const { fileName, inputRef, parsed, readError, reading, reset, selectFile } =
    useCsvImportFile<ParsedFactCsv>((raw) => parseFactCsv(raw, maxRows));
  const ready = parsed?.rows.filter((row) => row.errors.length === 0) ?? [];

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setOutcomes(null);
      importing.reset();
    }
    onOpenChange(next);
  };
  const confirm = () =>
    importing.mutate(
      { rows: ready.map((row) => row.input) },
      {
        onSuccess: (result) => {
          setOutcomes(
            new Map(
              result.rows.flatMap((row): [number, Outcome][] => {
                const sent = ready[row.index];
                return sent ? [[sent.line, row]] : [];
              }),
            ),
          );
          const created = result.rows.filter((row) => row.kind === 'created').length;
          notify('Facts imported', `${pluralCount(created, 'draft fact')} added.`);
        },
      },
    );

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Import facts from CSV"
      description="Columns: topic, statement, source_url. Facts import as drafts; runs check against them once you confirm them."
      width="wide"
      footer={
        outcomes ? (
          <Button variant="primary" onClick={() => close(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              pending={importing.isPending}
              disabled={reading || ready.length === 0 || Boolean(parsed?.errors.length)}
              onClick={confirm}
            >
              Import {pluralCount(ready.length, 'fact')}
            </Button>
          </>
        )
      }
    >
      {importing.isError ? (
        <Notice tone="negative">
          {humanizeApiError(importing.error, "Couldn't import the facts. Try again.").message}
        </Notice>
      ) : null}
      {outcomes ? null : (
        <Stack gap="compact">
          <CsvImportFileInput inputRef={inputRef} onSelect={(file) => void selectFile(file)} />
          <Button
            variant="secondary"
            box="start"
            onClick={() => downloadCsv('facts-sample.csv', FACT_CSV_COLUMNS, FACT_CSV_SAMPLE_ROWS)}
          >
            <Icon icon={Download} />
            Download sample CSV
          </Button>
        </Stack>
      )}
      {readError ? <Notice tone="negative">{readError}</Notice> : null}
      {parsed?.errors.length ? <Notice tone="negative">{parsed.errors.join(' ')}</Notice> : null}
      <CsvImportPreview
        counts={
          parsed?.rows.length
            ? { rows: parsed.rows.length, skipped: parsed.rows.length - ready.length }
            : null
        }
        fileName={fileName}
      >
        {parsed ? (
          <CsvPreviewTable
            label="Parsed facts"
            textLabel="Statement"
            rows={parsed.rows}
            text={(row) => row.input.statement}
            status={(row) => <RowStatus row={row} outcome={outcomes?.get(row.line)} />}
          />
        ) : null}
      </CsvImportPreview>
    </Dialog>
  );
}

function RowStatus({ row, outcome }: Readonly<{ row: ParsedFactRow; outcome?: Outcome }>) {
  if (row.errors.length || !outcome) return <CsvRowStatus errors={row.errors} />;
  switch (outcome.kind) {
    case 'created':
      return <StatusMark tone="positive">Added as draft</StatusMark>;
    case 'duplicate':
      return <StatusMark tone="neutral">Already a fact</StatusMark>;
    case 'invalid':
      return <StatusMark tone="negative">{outcome.message}</StatusMark>;
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}
