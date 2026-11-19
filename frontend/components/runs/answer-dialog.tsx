import { useQuery } from '@tanstack/react-query';
import { Globe } from 'lucide-react';
import { lazy, useEffect, type ReactNode } from 'react';

import { choiceFilter } from '@/components/ui/all-filters';
import { ClampText } from '@/components/ui/clamp-text';
import { Dialog } from '@/components/ui/dialog';
import { EngineMark, engineMarkKey } from '@/components/ui/engine-mark';
import { FilterControls } from '@/components/ui/filter-bar';
import { Icon } from '@/components/ui/icon';
import { IslandUnavailable, LazyIsland } from '@/components/ui/lazy-island';
import { Stack } from '@/components/ui/layout';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/components/ui/state-block';
import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import type { ExecutionEvidence, ExecutionStatus } from '@citeladder/contracts';
import { runsQueries } from '@/lib/api/runs';
import { formatCountry } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { promptHistoryHref } from '@/lib/prompts/history';
import { useEngineCatalog } from '@/lib/providers/engines';
import { EXECUTION_STATES, executionStatusLabel } from '@/lib/runs/status';
import { usePromptEngineAnswers } from '@/lib/runs/use-prompt-engine-answers';

/**
 * The answer view and the markdown renderer behind it are fetched when a
 * dialog opens, not with every screen that can open one: Visibility lists
 * source rows on every visit, and few of those visits open an answer.
 */
const loadAnswerEvidence = () => import('@/components/runs/answer-evidence');
const AnswerEvidence = lazy(() =>
  loadAnswerEvidence().then(({ AnswerEvidence }) => ({ default: AnswerEvidence })),
);

/**
 * What the dialog needs from whatever row opened it: the execution id, and
 * what it knows of the prompt. Structural, so a run's executions and the
 * source-prompt rows (`task_id`) both open it without fabricating an
 * `Execution`; the answer itself comes from the single-execution read.
 */
export type EvidenceSubject = {
  /** The execution id; null while the opener is still finding it. */
  id: string | null;
  prompt_text?: string;
  prompt_index?: number;
  /** The library prompt, when the opener knows it: the header links to its history. */
  prompt_id?: string | null;
};

/** The dialog names the prompt once: its text, or its number when the opener has no text. */
function answerTitle(subject: EvidenceSubject | null): ReactNode {
  if (subject?.prompt_text) return <ClampText>{subject.prompt_text}</ClampText>;
  if (subject?.prompt_index !== undefined) return `Prompt #${subject.prompt_index + 1}`;
  return 'Answer';
}

function AnswerLoading() {
  return (
    <Stack gap="workspace" aria-label="Loading the answer">
      <Skeleton lines={1} />
      <Skeleton lines={3} />
      <Skeleton variant="facts" />
    </Stack>
  );
}

/** A country's flag from its two-letter code; nothing for any other code. */
function flagOf(code: string): string | null {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(upper)) return null;
  return String.fromCodePoint(
    ...[...upper].map((letter) => 0x1f1a5 + (letter.codePointAt(0) ?? 0)),
  );
}

function MarketChip({ auditId }: Readonly<{ auditId: string }>) {
  const { workspaceId } = useProjectScope();
  const audit = useQuery(runsQueries.detail(workspaceId, auditId));
  const code = audit.data?.market.country_code;
  if (!code) return null;
  const flag = flagOf(code);
  return (
    <Tag>
      {flag ? <span aria-hidden>{flag}</span> : <Icon icon={Globe} />}
      {formatCountry(code)}
    </Tag>
  );
}

function EngineChip({ engine }: Readonly<{ engine: string }>) {
  const label = useEngineCatalog().label(engine);
  const key = engineMarkKey(engine);
  return (
    <Tag>
      {key ? <EngineMark engine={key} placement="inline" /> : null}
      {label}
    </Tag>
  );
}

const SENTIMENT_WORDS = {
  positive: 'Positive sentiment',
  neutral: 'Neutral sentiment',
  negative: 'Negative sentiment',
  mixed: 'Mixed sentiment',
} as const;

/** Your brand's sentiment in this answer, only where it was classified; no score is stored. */
function SentimentChip({ evidence }: Readonly<{ evidence: ExecutionEvidence }>) {
  const own = evidence.perception.find((entity) => entity.is_brand);
  const label = own?.state === 'classified' ? own.label : null;
  if (!label || label === 'not_assessable') return null;
  return (
    <StatusMark variant="sentiment" value={label}>
      {SENTIMENT_WORDS[label]}
    </StatusMark>
  );
}

/** Answer features we record, each shown only when the stored evidence knows it. */
function FeatureFlags({ evidence }: Readonly<{ evidence: ExecutionEvidence }>) {
  const { ads, answer_formats: formats } = evidence;
  let adsWord: string | null = null;
  if (ads.applicability === 'applicable')
    adsWord = ads.items.length === 1 ? '1 ad' : `${ads.items.length || 'No'} ads`;
  return (
    <>
      {evidence.search_used ? <Tag>Web search used</Tag> : null}
      {adsWord ? <Tag>{adsWord}</Tag> : null}
      {formats.kind === 'observed'
        ? formats.formats.map((format) => <Tag key={format}>{format} answer</Tag>)
        : null}
    </>
  );
}

function StatusChip({ status, engine }: Readonly<{ status: ExecutionStatus; engine: string }>) {
  const label = executionStatusLabel(status, useEngineCatalog().label(engine));
  return (
    <StatusMark variant="status" value={EXECUTION_STATES[status].badge}>
      {label}
    </StatusMark>
  );
}

/** One answer, drawn as the chat it was, over the screen that opened it. */
export function AnswerDialog({
  execution,
  open,
  onOpenChange,
  unavailable,
}: Readonly<{
  execution: EvidenceSubject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Said in place of the answer when the opener found none to show. */
  unavailable?: string;
}>) {
  const { workspaceId } = useProjectScope();
  const engines = usePromptEngineAnswers({
    workspaceId,
    executionId: execution?.id ?? null,
    enabled: open,
  });
  const evidenceQuery = useQuery({
    ...runsQueries.execution(workspaceId, engines.activeId),
    enabled: open && engines.activeId !== null,
  });
  // Start the view's download beside the evidence read rather than after it.
  useEffect(() => {
    if (open) void loadAnswerEvidence().catch(() => {});
  }, [open]);
  const evidence = unavailable ? undefined : evidenceQuery.data;

  let body: ReactNode;
  if (unavailable) {
    body = <StateBlock kind="empty" icon={ICONS.runs} heading={unavailable} />;
  } else if (evidenceQuery.isError) {
    body = (
      <Notice
        kind="read"
        {...readErrorProps(evidenceQuery)}
        title="Couldn't load this answer's evidence"
        fallback="The request failed or timed out."
      />
    );
  } else if (!evidence) {
    body = <AnswerLoading />;
  } else {
    body = (
      <LazyIsland
        label="answer-evidence"
        defects="surface"
        loading={<AnswerLoading />}
        failed={<IslandUnavailable message="Couldn't load the answer." />}
      >
        <AnswerEvidence
          evidence={evidence}
          promptText={execution?.prompt_text ?? null}
          promptId={execution?.prompt_id ?? undefined}
        />
      </LazyIsland>
    );
  }

  const promptId = execution?.prompt_id;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={answerTitle(execution)}
      width="answer"
      toolbar={
        <>
          {engines.status && evidence ? (
            <StatusChip status={engines.status} engine={evidence.logical_engine} />
          ) : null}
          {evidence ? <EngineChip engine={evidence.logical_engine} /> : null}
          {evidence ? <MarketChip auditId={evidence.audit_id} /> : null}
          {evidence ? <SentimentChip evidence={evidence} /> : null}
          {evidence ? <FeatureFlags evidence={evidence} /> : null}
          {/* One engine's answer has nothing to choose; the filter appears with a second. */}
          {engines.options.length > 1 && engines.activeId !== null ? (
            <FilterControls
              filters={[
                choiceFilter({
                  id: 'engine',
                  label: 'Engine',
                  value: engines.activeId,
                  defaultValue: engines.activeId,
                  groups: [{ options: engines.options }],
                  onChange: engines.select,
                }),
              ]}
            />
          ) : null}
          {promptId ? (
            <TextLink href={promptHistoryHref(promptId)} text="caption" className="ms-auto">
              Prompt history
            </TextLink>
          ) : null}
        </>
      }
    >
      {body}
    </Dialog>
  );
}
