import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Check, Copy, Download } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

import './tool-panel.css';

const COPIED_MS = 1600;

export function ToolPanel({
  title,
  description,
  form,
  resultTitle = 'Result',
  status,
  result,
  empty = 'Results appear here.',
  copyText,
  onDownload,
  downloadLabel = 'Download',
}: Readonly<{
  title: string;
  description?: ReactNode;
  form: ReactNode;
  resultTitle?: string;
  status?: ReactNode;
  result?: ReactNode;
  empty?: ReactNode;
  copyText?: string;
  onDownload?: () => void;
  downloadLabel?: string;
}>) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copyResult = async () => {
    if (!copyText) return;
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      setCopy('failed');
      return;
    }
    setCopy('copied');
    timer.current = setTimeout(() => setCopy('idle'), COPIED_MS);
  };

  return (
    <section className="cl-tool" aria-label={title}>
      <div className="cl-tool-form">
        <h2 className="cl-tool-title">{title}</h2>
        {description && <p className="cl-tool-desc">{description}</p>}
        <div className="cl-tool-fields">{form}</div>
      </div>
      <div className="cl-tool-result">
        <div className="cl-tool-bar">
          <p className="cl-tool-rtitle">{resultTitle}</p>
          {status && <span className="cl-tool-status">{status}</span>}
          <div className="cl-tool-actions">
            <output className="cl-tool-copy-status" data-failed={copy === 'failed' || undefined}>
              {copy === 'copied' && 'Copied'}
              {copy === 'failed' && 'Couldn’t copy'}
            </output>
            <Button
              variant="quiet"
              className="cl-tool-copy"
              disabled={!copyText}
              onClick={() => void copyResult()}
            >
              <Icon icon={copy === 'copied' ? Check : Copy} />
              Copy
            </Button>
            {onDownload && (
              <Button variant="quiet" disabled={!copyText} onClick={onDownload}>
                <Icon icon={Download} />
                {downloadLabel}
              </Button>
            )}
          </div>
        </div>
        <div className="cl-tool-output">{result ?? <p className="cl-tool-empty">{empty}</p>}</div>
      </div>
    </section>
  );
}
