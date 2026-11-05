'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

/** How long "Copied" shows before the button reads "Copy" again. */
const COPIED_MS = 1600;

/**
 * ToolPanel: a free tool's shell, the form on 5/12 beside a paper result
 * well on 7/12 (stacked under 1024px). The well holds a 420px floor whether
 * it shows the empty line or a result, and Copy keeps one width as it reads
 * "Copied", so running the tool moves nothing around it.
 */
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
  /** The text Copy writes to the clipboard; Copy is disabled without it. */
  copyText?: string;
  onDownload?: () => void;
  downloadLabel?: string;
}>) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
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
            <Button
              variant="ghost"
              className="cl-tool-copy"
              disabled={!copyText}
              onClick={() => void copy()}
            >
              <Icon icon={copied ? Check : Copy} />
              {copied ? 'Copied' : 'Copy'}
            </Button>
            {onDownload && (
              <Button variant="ghost" disabled={result === undefined} onClick={onDownload}>
                <Icon icon={Download} />
                {downloadLabel}
              </Button>
            )}
          </div>
        </div>
        <div className="cl-tool-output" aria-live="polite">
          {result ?? <p className="cl-tool-empty">{empty}</p>}
        </div>
      </div>
    </section>
  );
}
