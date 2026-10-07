import { useState, type ReactNode, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FREE_TOOL_LIMITS } from '@/lib/config/free-tools';

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
            maxLength={FREE_TOOL_LIMITS.text}
            rows={9}
            spellCheck={false}
          />
        ) : (
          <Input
            {...props}
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            maxLength={FREE_TOOL_LIMITS.field}
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
  return (
    <div className="cp-tool">
      <form onSubmit={submit} className="cp-tool-pane">
        <h2 className="website-small-heading cp-tool-head">Your input</h2>
        {children}
        <div className="cp-tool-actions">
          <Button type="submit">{action}</Button>
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
        {error && (
          <p role="alert" className="text-danger-text website-body">
            {error}
          </p>
        )}
      </form>
      <section aria-label="Tool output" className="cp-tool-pane cp-tool-result">
        <div className="cp-tool-head">
          <h2 className="website-small-heading">Your result</h2>
          <output className="website-label">{status}</output>
        </div>
        {preview}
        {current && (
          <>
            <Textarea
              className="font-mono"
              rows={18}
              readOnly
              value={current}
              aria-label="Generated output"
            />
            <div className="cp-tool-actions">
              <CopyButton value={current}>Copy result</CopyButton>
              <Button type="button" variant="secondary" onClick={() => download(current, filename)}>
                Download
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
