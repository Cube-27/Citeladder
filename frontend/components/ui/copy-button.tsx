'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from './button';
import { useToast } from './toast';

export type CopyButtonProps = Omit<
  ComponentPropsWithoutRef<typeof Button>,
  'asChild' | 'onClick' | 'pending'
> & {
  value: string;
  copiedLabel?: string;
  iconOnly?: boolean;
};

export function CopyButton({
  value,
  children = 'Copy',
  copiedLabel = 'Copied',
  iconOnly = false,
  ...props
}: Readonly<CopyButtonProps>) {
  const { notify } = useToast();
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy() {
    setStatus('copying');
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
      notify(copiedLabel);
      resetTimer.current = setTimeout(() => setStatus('idle'), 1800);
    } catch {
      setStatus('error');
    }
  }

  // An icon-only button says what it does through its label alone, so the
  // copied confirmation has to live there too; a labelled one carries its own
  // text and reports a failed copy in it.
  const iconLabel = status === 'copied' ? copiedLabel : 'Copy';
  let label: ReactNode = children;
  if (status === 'copied') label = copiedLabel;
  else if (status === 'error') label = 'Copy failed — retry';

  return (
    <Button
      variant="secondary"
      {...props}
      pending={status === 'copying'}
      onClick={() => void copy()}
      aria-live="polite"
      aria-label={iconOnly ? iconLabel : props['aria-label']}
    >
      {status === 'copied' ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      {iconOnly ? null : label}
    </Button>
  );
}
