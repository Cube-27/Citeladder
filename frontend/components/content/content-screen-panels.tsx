import { Check, Circle, History, RefreshCw, Sparkles, X } from 'lucide-react';
import { type RefObject } from 'react';

import { SkillPicker } from '@/components/content/skill-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Input } from '@/components/ui/input';
import type { ContentTargetPage } from '@/lib/api/content';
import { CONTENT_INSTRUCTION_MAX_LEN } from '@/lib/api/content';
import type { ContentContextPreview } from '@/lib/api/types';
import { ICONS } from '@/lib/icons';

import {
  actionErrorMessage,
  type ContentOpportunityContext,
  type ContentSkillView,
} from './content-screen-data';
import { textRole } from '@/components/ui/typography';
import { panelClasses } from '@/components/ui/panel';
import { cn } from '@/lib/utils';

export function ContentComposer({
  instruction,
  instructionRef,
  opportunity,
  contextPreview,
  contextLoading,
  target,
  targetUrl,
  targetPages,
  onTargetChange,
  onTargetSearchChange,
  onTargetUrlChange,
  generating,
  skillId,
  skills,
  skillsLoading,
  canGenerate,
  onInstructionChange,
  onSkillChange,
  onGenerate,
  onHistoryOpen,
}: Readonly<{
  instruction: string;
  instructionRef: RefObject<HTMLTextAreaElement | null>;
  opportunity?: ContentOpportunityContext | null;
  contextPreview?: ContentContextPreview | null;
  contextLoading?: boolean;
  target: { siteUrlId?: string; url?: string };
  targetUrl: string;
  targetPages: readonly ContentTargetPage[];
  onTargetChange: (target: { siteUrlId?: string; url?: string }) => void;
  onTargetSearchChange: (value: string) => void;
  onTargetUrlChange: (value: string) => void;
  generating: boolean;
  skillId: string;
  skills: readonly ContentSkillView[];
  skillsLoading: boolean;
  canGenerate: boolean;
  onInstructionChange: (value: string) => void;
  onSkillChange: (value: string) => void;
  onGenerate: () => void;
  onHistoryOpen: () => void;
}>) {
  return (
    <Card data-component-id="content-composer" className="p-[var(--card-padding-large)]">
      <CardContent className="flex flex-col gap-[var(--workspace-gap)] p-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <span className={eyebrowClasses}>New generation</span>
            <h2 className={textRole('sectionTitle', 'tracking-tight')}>
              What can I help you create?
            </h2>
          </div>
          <Button variant="secondary" size="sm" onClick={onHistoryOpen} className="gap-2">
            <History className="size-4" aria-hidden />
            History
          </Button>
        </div>
        {opportunity ? <OpportunityContext opportunity={opportunity} /> : null}
        <TargetPageSelect
          target={target}
          targetUrl={targetUrl}
          pages={targetPages}
          disabled={generating}
          onSearchChange={onTargetSearchChange}
          onTargetUrlChange={onTargetUrlChange}
          onChange={onTargetChange}
        />
        <label
          id="content-user-instruction-label"
          htmlFor="content-user-instruction"
          className={textRole('label')}
        >
          Your instruction
        </label>
        <Textarea
          id="content-user-instruction"
          ref={instructionRef}
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          disabled={generating}
          maxLength={CONTENT_INSTRUCTION_MAX_LEN}
          rows={opportunity ? 10 : 4}
          aria-label="Your instruction"
          aria-labelledby="content-user-instruction-label"
          placeholder="Describe the website content you want to create…"
          className="border-border bg-background focus:bg-panel rounded-[var(--radius-control)] p-4 text-sm leading-relaxed"
        />
        <SkillPicker
          skills={skills}
          value={skillId}
          onChange={onSkillChange}
          disabled={generating}
          loading={skillsLoading}
        />
        <div className="border-border flex flex-wrap items-end justify-between gap-4 border-t pt-4">
          <ContextIndicator preview={contextPreview} loading={contextLoading} />
          <Button
            data-component-id="content-generate-button"
            disabled={!canGenerate}
            onClick={onGenerate}
            className="gap-2"
          >
            <Sparkles className="size-4" aria-hidden /> Generate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TargetPageSelect({
  target,
  targetUrl,
  pages,
  disabled,
  onSearchChange,
  onTargetUrlChange,
  onChange,
}: Readonly<{
  target: { siteUrlId?: string; url?: string };
  targetUrl: string;
  pages: readonly ContentTargetPage[];
  disabled: boolean;
  onSearchChange: (value: string) => void;
  onTargetUrlChange: (value: string) => void;
  onChange: (target: { siteUrlId?: string; url?: string }) => void;
}>) {
  const selected = pages.find((page) => page.site_url_id === target.siteUrlId);
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <label
          className={cn(textRole('label'), 'sm:col-start-1 sm:row-start-1')}
          htmlFor="content-target-page"
        >
          Target page (optional)
        </label>
        <div className="sm:col-start-1 sm:row-start-2">
          <SearchableSelect
            id="content-target-page"
            ariaLabel="Target page"
            value={target.siteUrlId ?? ''}
            disabled={disabled}
            placeholder="Search crawled pages"
            unknownValueFallback={() => ''}
            options={pages.map((page) => ({
              value: page.site_url_id,
              label: page.title,
              detail: page.display_url,
            }))}
            onSearchChange={onSearchChange}
            onChange={(siteUrlId) => {
              onTargetUrlChange('');
              onChange({ siteUrlId });
            }}
          />
        </div>
        <label
          className={cn(textRole('label'), 'sm:col-start-2 sm:row-start-1')}
          htmlFor="content-target-url"
        >
          Or enter URL instead
        </label>
        <div className="sm:col-start-2 sm:row-start-2">
          <Input
            id="content-target-url"
            aria-label="Enter target URL instead"
            value={targetUrl}
            disabled={disabled}
            placeholder="https://example.com/page"
            onChange={(event) => {
              const value = event.target.value;
              onTargetUrlChange(value);
              const trimmed = value.trim();
              onChange(isHttpTargetUrl(trimmed) ? { url: trimmed } : {});
            }}
          />
        </div>
      </div>
      {selected ? (
        <p className="text-muted text-xs">
          Selected: {selected.title} · {selected.display_url}
        </p>
      ) : target.url ? (
        <p className="text-muted text-xs">Selected URL: {target.url}</p>
      ) : null}
      {target.siteUrlId || target.url ? (
        <div>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              onTargetUrlChange('');
              onChange({});
            }}
          >
            No page
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Only a complete http(s) address is an addressable target the backend can use. */
function isHttpTargetUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== '';
  } catch {
    return false;
  }
}

/** Compact summary of the canonical server-built context, never its evidence text. */
function ContextIndicator({
  preview,
  loading,
}: Readonly<{ preview?: ContentContextPreview | null; loading?: boolean }>) {
  const parts = preview?.brand_memory ? ['Brand memory'] : [];
  if (preview?.target_page) parts.push(preview.target_page);
  if (preview?.issue_count) {
    parts.push(`${preview.issue_count} ${preview.issue_count === 1 ? 'issue' : 'issues'}`);
  }
  if (preview?.related_page_count) {
    parts.push(
      `${preview.related_page_count} related ${preview.related_page_count === 1 ? 'page' : 'pages'}`,
    );
  }
  const label = loading
    ? 'Checking context…'
    : preview
      ? `Context: ${parts.join(' · ') || 'User instruction only'}`
      : 'Context unavailable';
  return (
    <div data-component-id="content-context-indicator" className={textRole('label', 'grid gap-1')}>
      <ContextLine available={Boolean(preview?.brand_memory)} label={label} />
    </div>
  );
}

function ContextLine({ available, label }: Readonly<{ available: boolean; label: string }>) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {available ? (
        <Check className="text-accent size-3.5 shrink-0" aria-hidden />
      ) : (
        <Circle className="size-3.5 shrink-0" aria-hidden />
      )}
      {label}
    </span>
  );
}

/** Compact provenance; the editable task itself appears once in the textarea. */
function OpportunityContext({ opportunity }: Readonly<{ opportunity: ContentOpportunityContext }>) {
  return (
    <div
      data-component-id="content-opportunity-context"
      className={panelClasses({ tone: 'well' }, 'grid min-w-0 gap-2 [overflow-wrap:anywhere]')}
    >
      <span className={eyebrowClasses}>Based on opportunity</span>
      <p className={textRole('bodyStrong', 'min-w-0')}>{opportunity.title}</p>
      {opportunity.target ? (
        <p className="text-muted min-w-0 text-xs">Target: {opportunity.target}</p>
      ) : null}
      <p className="text-muted text-xs">
        Path: {opportunity.pathway === 'earned' ? 'Earned' : 'Owned'}
        {opportunity.canonicalDomain ? ` · ${opportunity.canonicalDomain}` : ''}
      </p>
      {opportunity.citations.length ? (
        <p className="text-muted text-xs">
          {opportunity.citations.length} representative cited page
          {opportunity.citations.length === 1 ? '' : 's'} supplied
        </p>
      ) : null}
      {opportunity.limitations.map((limitation) => (
        <p key={limitation} className="text-warning text-xs">
          {limitation}
        </p>
      ))}
    </div>
  );
}

export function GeneratingPanel({
  selectedId,
  cancelling,
  onCancel,
}: Readonly<{
  selectedId: string | null;
  cancelling: boolean;
  onCancel: (generationId: string) => void;
}>) {
  return (
    <Card data-component-id="content-generating-panel" className="p-[var(--card-padding-large)]">
      <CardContent className="flex items-center gap-4 p-0">
        <output aria-label="Generating content" className="flex items-center gap-3">
          <ICONS.spinner className="text-accent size-5 animate-spin" aria-hidden />
          <span className={textRole('bodyStrong')}>Generating your content…</span>
        </output>
        <div className="ml-auto">
          <Button
            variant="secondary"
            data-component-id="content-cancel-button"
            disabled={!selectedId || cancelling}
            onClick={() => selectedId && onCancel(selectedId)}
            size="sm"
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function GenerationErrorPanel({
  mutationError,
  failedGenerationId,
  retrying,
  onTryAgain,
  onDismiss,
}: Readonly<{
  mutationError: unknown;
  failedGenerationId: string | null;
  retrying: boolean;
  onTryAgain: (generationId: string) => void;
  onDismiss: () => void;
}>) {
  return (
    <Card
      data-component-id="content-error-panel"
      tone="danger"
      className="bg-danger-bg p-[var(--card-padding-large)]"
    >
      <CardContent className="flex flex-col gap-4 p-0">
        <div role="alert" className="text-danger-text flex items-start gap-2.5 text-sm">
          <ICONS.warning className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className={textRole('emphasis', 'leading-relaxed')}>
            {mutationError
              ? actionErrorMessage(mutationError)
              : 'Generation failed. You can edit your instruction and try again.'}
          </span>
        </div>
        <div className="flex gap-2.5 pt-1">
          {failedGenerationId ? (
            <Button
              data-component-id="content-retry-button"
              disabled={retrying}
              onClick={() => onTryAgain(failedGenerationId)}
              size="sm"
            >
              <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
              Try again
            </Button>
          ) : null}
          <Button
            variant="secondary"
            data-component-id="content-dismiss-button"
            onClick={onDismiss}
            size="sm"
          >
            <X className="mr-1.5 size-3.5" aria-hidden />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
