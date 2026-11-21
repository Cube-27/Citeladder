import { useState, type ReactNode, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { ToolPanel } from '../sections/tool-panel';

export function ToolInput({
  label,
  value,
  onChange,
  multiline = false,
  hint,
  type = 'text',
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  hint?: string;
  type?: string;
}>) {
  return (
    <Field label={label} hint={hint}>
      {(props) =>
        multiline ? (
          <Textarea
            {...props}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={9}
            spellCheck={false}
          />
        ) : (
          <Input
            {...props}
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      }
    </Field>
  );
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ToolForm({
  children,
  run,
  action,
  filename = 'citeladder-report.txt',
  sample,
  signature,
  preview,
}: Readonly<{
  children: ReactNode;
  run: () => string;
  action: string;
  filename?: string;
  sample: () => void;
  signature: string;
  preview?: ReactNode;
}>) {
  const [result, setResult] = useState<{ text: string; signature: string } | null>(null);
  const [error, setError] = useState('');
  const current = result?.signature === signature ? result.text : '';
  let status = 'Enter your details or load an example, then run the tool.';
  if (current) status = 'Ready. Based only on the input you supplied.';
  else if (result) status = 'Input changed. Run the tool again to update your result.';
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setResult({ text: run(), signature });
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not process this input.');
      setResult(null);
    }
  }
  const output = current ? (
    <Textarea
      className="font-mono"
      rows={18}
      readOnly
      value={current}
      aria-label="Generated output"
    />
  ) : undefined;
  const shown =
    preview || output ? (
      <div className="cl-tool-run">
        {preview}
        {output ?? <p className="cl-tool-hint">{status}</p>}
      </div>
    ) : undefined;
  return (
    <ToolPanel
      title="Your input"
      resultTitle="Your result"
      status={output ? status : undefined}
      empty={status}
      form={
        <form onSubmit={submit} className="cl-tool-run">
          {children}
          <div className="cl-tool-run-actions">
            <Button type="submit" variant="primary">
              {action}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                sample();
                setResult(null);
                setError('');
              }}
            >
              Load example
            </Button>
          </div>
          <output className="sr-only">{status}</output>
          {error && (
            <p role="alert" className="text-negative">
              {error}
            </p>
          )}
        </form>
      }
      result={shown}
      copyText={current || undefined}
      onDownload={() => {
        if (current) download(current, filename);
      }}
    />
  );
}
