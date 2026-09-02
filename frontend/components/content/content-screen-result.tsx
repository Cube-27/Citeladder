import { Download, RefreshCw } from 'lucide-react';
import Link from 'next/link';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import type { ContentFeedbackReason, ContentGenerationDetail } from '@/lib/api/types';
import { ContentMarkdown } from '@/lib/content/markdown';
import { textRole } from '@/components/ui/typography';

export function GenerationResult({
  detail,
  regenerating,
  feedbackPending,
  reasonOpen,
  onExport,
  onRegenerate,
  onFeedback,
  onRejectClick,
}: Readonly<{
  detail: ContentGenerationDetail;
  regenerating: boolean;
  feedbackPending: boolean;
  reasonOpen: boolean;
  onExport: () => void;
  onRegenerate: (generationId: string) => void;
  onFeedback: (
    generationId: string,
    feedback: 'accepted' | 'rejected',
    reason?: ContentFeedbackReason,
  ) => void;
  onRejectClick: () => void;
}>) {
  return (
    <Card data-component-id="content-result-card" className="min-w-0 p-[var(--card-padding)]">
      <CardContent className="flex flex-col gap-[var(--workspace-gap)] p-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={textRole('sectionTitle', 'tracking-tight')}>Generated content</h2>
          <DraftActionButtons
            detail={detail}
            regenerating={regenerating}
            onExport={onExport}
            onRegenerate={onRegenerate}
            placement="top"
          />
        </div>
        {detail.output_truncated ? (
          <div data-component-id="content-truncation-warning">
            <Alert tone="warning">
              The output hit the length limit and may be incomplete. Regenerate or shorten your
              instruction for a complete result.
            </Alert>
          </div>
        ) : null}
        <ResultBody detail={detail} />
        <ResultActions
          detail={detail}
          regenerating={regenerating}
          feedbackPending={feedbackPending}
          onExport={onExport}
          onRegenerate={onRegenerate}
          onFeedback={onFeedback}
          onRejectClick={onRejectClick}
        />
        {reasonOpen && detail.feedback === null ? (
          <FeedbackReasonPicker
            disabled={feedbackPending}
            onSelect={(reason) => onFeedback(detail.id, 'rejected', reason)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResultBody({ detail }: Readonly<{ detail: ContentGenerationDetail }>) {
  return (
    <>
      <div
        data-component-id="content-result-body"
        className="max-h-[60vh] max-w-full min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain py-2 pe-2"
      >
        <ContentMarkdown markdown={detail.output_text ?? ''} />
      </div>
      <p data-component-id="content-ai-disclaimer" className="text-muted text-sm leading-relaxed">
        AI-generated {detail.skill_id} — review and revise before publishing. Generated prose never
        becomes a project fact.
      </p>
      <div
        data-component-id="content-result-provenance"
        className="border-border text-muted flex flex-wrap items-center gap-x-2 border-t pt-4 text-xs"
      >
        {contextUsedLabel(detail)}
      </div>
    </>
  );
}

/** One quiet line: which canonical context was available to this draft. */
function contextUsedLabel(detail: ContentGenerationDetail): string {
  const pages = detail.context_summary.crawl_page_count;
  if (pages > 0) {
    return `Context used: website crawl · ${pages} ${pages === 1 ? 'page' : 'pages'}`;
  }
  if (detail.context_summary.brand_fields.length > 0) {
    return 'Context used: brand memory';
  }
  return 'Context used: user instruction only';
}

function ResultActions({
  detail,
  regenerating,
  feedbackPending,
  onExport,
  onRegenerate,
  onFeedback,
  onRejectClick,
}: Readonly<{
  detail: ContentGenerationDetail;
  regenerating: boolean;
  feedbackPending: boolean;
  onExport: () => void;
  onRegenerate: (id: string) => void;
  onFeedback: (
    id: string,
    feedback: 'accepted' | 'rejected',
    reason?: ContentFeedbackReason,
  ) => void;
  onRejectClick: () => void;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <DraftActionButtons
        detail={detail}
        regenerating={regenerating}
        onExport={onExport}
        onRegenerate={onRegenerate}
        placement="bottom"
      />
      {detail.opportunity_id ? (
        <Button asChild variant="secondary" size="md">
          <Link href={`/opportunities?opportunity_id=${detail.opportunity_id}`}>
            Return to opportunity
          </Link>
        </Button>
      ) : null}
      <div className="ms-auto flex items-center gap-2">
        {detail.feedback === null ? (
          <>
            <Button
              size="sm"
              disabled={feedbackPending}
              onClick={() => onFeedback(detail.id, 'accepted')}
            >
              Helpful
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-component-id="content-reject-button"
              disabled={feedbackPending}
              onClick={onRejectClick}
            >
              Not useful
            </Button>
          </>
        ) : (
          <span className={textRole('bodyStrong')}>
            {detail.feedback === 'accepted' ? 'Marked helpful' : 'Marked not useful'}
          </span>
        )}
      </div>
    </div>
  );
}

function DraftActionButtons({
  detail,
  regenerating,
  onExport,
  onRegenerate,
  placement,
}: Readonly<{
  detail: ContentGenerationDetail;
  regenerating: boolean;
  onExport: () => void;
  onRegenerate: (id: string) => void;
  placement: 'top' | 'bottom';
}>) {
  const componentSuffix = placement === 'top' ? '-top' : '';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton
        value={detail.output_text ?? ''}
        size="md"
        data-component-id={`content-copy-button${componentSuffix}`}
      >
        Copy
      </CopyButton>
      <Button
        variant="secondary"
        size="md"
        data-component-id={`content-export-button${componentSuffix}`}
        onClick={onExport}
      >
        <Download className="mr-1.5 size-4" aria-hidden />
        Export Markdown
      </Button>
      <Button
        variant="secondary"
        size="md"
        data-component-id={`content-regenerate-button${componentSuffix}`}
        disabled={regenerating}
        onClick={() => onRegenerate(detail.id)}
      >
        <RefreshCw className="mr-1.5 size-4" aria-hidden />
        Regenerate
      </Button>
    </div>
  );
}

const FEEDBACK_REASONS: ReadonlyArray<{ value: ContentFeedbackReason; label: string }> = [
  { value: 'too_generic', label: 'Too generic' },
  { value: 'wrong_tone', label: 'Wrong tone' },
  { value: 'missed_topic', label: 'Missed the topic' },
  { value: 'incorrect_facts', label: 'Incorrect facts' },
  { value: 'other', label: 'Other' },
];

/**
 * Why a draft missed. Shown only after "Not useful" is pressed, so the
 * common path stays a single click and the reason never becomes a required
 * field standing between the user and dismissing a bad result.
 */
function FeedbackReasonPicker({
  disabled,
  onSelect,
}: Readonly<{
  disabled: boolean;
  onSelect: (reason: ContentFeedbackReason) => void;
}>) {
  return (
    <div
      data-component-id="content-feedback-reasons"
      className="border-border flex flex-wrap items-center gap-2 border-t pt-4"
    >
      <span className={textRole('bodyStrong')}>Why?</span>
      {FEEDBACK_REASONS.map((reason) => (
        <Button
          key={reason.value}
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onSelect(reason.value)}
        >
          {reason.label}
        </Button>
      ))}
    </div>
  );
}
