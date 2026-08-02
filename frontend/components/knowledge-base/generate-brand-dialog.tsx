'use client';

import { Sparkles } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { httpErrorStatus } from '@/lib/api/errors';

/**
 * Shared AI suggestion dialog (competitors and owned domains). Suggestions are
 * appended into the form for review; nothing is persisted until the user saves.
 *
 * The per-action consent checkbox is gone (plan.md §10, decision 13): AI
 * discovery is the product's core flow now that onboarding is built on it, so
 * asking "may we send your brand name to the AI provider?" before every
 * generation was friction in front of the thing the user came for. Consent is
 * product-level via the sign-up terms.
 *
 * The backend gate is untouched — `confirm_send_evidence` is still a required
 * field enforced with a 422; callers simply always send `true`.
 */
export function GenerateBrandDialog({
  open,
  onOpenChange,
  title,
  description,
  onGenerate,
  isGenerating,
  error,
  resultSummary,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onGenerate: () => Promise<void> | void;
  isGenerating?: boolean;
  error?: unknown;
  /** Set after a successful run so the dialog can summarize it. */
  resultSummary?: string | null;
}>) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="w-130"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {resultSummary ? 'Close' : 'Cancel'}
          </Button>
          {/* The rejection is caught, not discarded: callers pass a mutateAsync
              wrapper, whose failure already lands in the `error` prop rendered
              by SuggestErrorAlert below. Swallowing it here keeps that the only
              surface instead of also raising an unhandled rejection. */}
          <Button
            variant="primary"
            onClick={() => {
              void Promise.resolve(onGenerate()).catch(() => {});
            }}
            disabled={isGenerating}
          >
            <Sparkles className="size-4" aria-hidden />
            {isGenerating ? 'Generating…' : 'Generate'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <SuggestErrorAlert error={error} /> : null}
        {resultSummary && !error ? <Alert tone="success">{resultSummary}</Alert> : null}
      </div>
    </Dialog>
  );
}

/** Map suggestion failures to actionable copy (503 config, 502 provider, 4xx). */
function SuggestErrorAlert({ error }: Readonly<{ error: unknown }>) {
  const status = httpErrorStatus(error);
  if (status === 503) {
    return (
      <Alert tone="warning">
        No AI provider is configured. Set <code>DEFAULT_AGENT_API_KEY</code> (and optionally{' '}
        <code>DEFAULT_AGENT_BASE_URL</code> / <code>DEFAULT_AGENT_MODEL</code>) in the backend
        environment, then try again.
      </Alert>
    );
  }
  if (status === 502) {
    return (
      <Alert tone="danger">
        The AI provider call failed or returned unusable output. Try again in a moment.
      </Alert>
    );
  }
  const message =
    error instanceof Error && error.message
      ? error.message
      : 'Generation failed. Please try again.';
  return <Alert tone="danger">{message}</Alert>;
}
