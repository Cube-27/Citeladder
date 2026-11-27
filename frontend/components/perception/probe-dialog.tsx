import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { marketLabel } from '@citeladder/contracts/markets';
import type { ProbeQuote } from '@citeladder/contracts/probes';
import type { LogicalEngine } from '@citeladder/contracts/providers';

import { InlineProviderSetup } from '@/components/runs/launch-dialog-view';
import { Absence } from '@/components/ui/absence';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { FactList } from '@/components/ui/facts';
import { Inline } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { RadioGroup } from '@/components/ui/radio-group';
import { TextLink } from '@/components/ui/text-link';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { probeMutations, probeQueries, refreshProbeStatus } from '@/lib/api/probes';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { PLANS_HREF } from '@/lib/billing/plan-limit';
import { formatCount, pluralCount } from '@/lib/format';
import { useEngineCatalog } from '@/lib/providers/engines';

export type ProbeIntent = { kind: 'run' } | { kind: 'schedule'; cadence: 'daily' | 'weekly' };

const COPY = {
  run: {
    title: 'Run a market probe',
    confirm: 'Run probe',
    action: 'run the probe',
    credits: 'AI credits',
  },
  daily: {
    title: 'Probe every day',
    confirm: 'Probe daily',
    action: 'save the schedule',
    credits: 'AI credits per run',
  },
  weekly: {
    title: 'Probe every week',
    confirm: 'Probe weekly',
    action: 'save the schedule',
    credits: 'AI credits per run',
  },
} as const;

export function ProbeDialog({
  scope,
  quote: all,
  intent,
  onClose,
}: Readonly<{
  scope: ProjectScope;
  quote: ProbeQuote;
  intent: ProbeIntent | null;
  onClose: () => void;
}>) {
  const client = useQueryClient();
  const run = useMutation(probeMutations.run(scope));
  const schedule = useMutation(probeMutations.schedule(scope));
  const [connecting, setConnecting] = useState(true);
  const [webSearch, setWebSearch] = useState(false);
  const choice = useProbeChoice(scope, all, intent !== null);
  const { quote, request } = choice;
  const short = quote.balance !== null && quote.credits > quote.balance;
  const copy = COPY[intent?.kind === 'schedule' ? intent.cadence : 'run'];
  const pending = intent?.kind === 'schedule' ? schedule : run;
  const close = () => {
    run.reset();
    schedule.reset();
    setConnecting(true);
    setWebSearch(false);
    choice.reset();
    onClose();
  };
  const confirm = () => {
    if (intent?.kind === 'schedule')
      schedule.mutate(
        { cadence: intent.cadence, fingerprint: quote.fingerprint, ...request },
        { onSuccess: close },
      );
    else
      run.mutate(
        { fingerprint: quote.fingerprint, ...request, web_search: webSearch },
        { onSuccess: close },
      );
  };
  return (
    <Dialog
      open={intent !== null}
      onOpenChange={(next) => (next ? undefined : close())}
      title={copy.title}
      description="Each engine answers what you're known for, which brands lead each theme, and why a buyer might not choose you."
      footer={
        <>
          <Button variant="quiet" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={quote.blocked !== null || short || choice.unsettled}
            pending={pending.isPending}
            onClick={confirm}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      {pending.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(pending.error, { action: copy.action })}
        />
      ) : null}
      {short ? (
        <Notice tone="warning" action={<TextLink href={PLANS_HREF}>See plans</TextLink>}>
          Not enough AI credits.
        </Notice>
      ) : null}
      <Blocked
        blocked={quote.blocked}
        connecting={connecting}
        onConnected={() => {
          setConnecting(false);
          refreshProbeStatus(client, scope);
        }}
      />
      {quote.blocked === null ? (
        <QuoteFacts quote={quote} credits={copy.credits} choice={choice} />
      ) : null}
      {quote.blocked === null && intent?.kind === 'run' ? (
        <WebSearchChoice checked={webSearch} onChange={setWebSearch} />
      ) : null}
    </Dialog>
  );
}

function choiceRequest(picked: readonly LogicalEngine[] | null, repeats: number | null) {
  return {
    ...(picked ? { engines: [...picked] } : {}),
    ...(repeats === null ? {} : { repetitions: repeats }),
  };
}

function WebSearchChoice({
  checked,
  onChange,
}: Readonly<{ checked: boolean; onChange: (checked: boolean) => void }>) {
  return (
    <Checkbox
      label="Web search"
      checked={checked}
      onCheckedChange={(next) => onChange(next === true)}
    />
  );
}

function useProbeChoice(scope: ProjectScope, all: ProbeQuote, open: boolean) {
  const [picked, setPicked] = useState<readonly LogicalEngine[] | null>(null);
  const [repeats, setRepeats] = useState<number | null>(null);
  const chosen = picked ?? all.engines;
  const repetitions = repeats ?? all.repetitions;
  const changed = picked !== null || repeats !== null;
  const narrowing = changed && chosen.length > 0;
  const narrowed = useQuery({
    ...probeQueries.quote(scope, { engines: chosen, repetitions }),
    enabled: open && narrowing,
  });
  const shown = narrowing ? narrowed.data : undefined;
  return {
    available: all.available_engines,
    chosen,
    repetitions,
    maxRepetitions: all.max_repetitions,
    request: choiceRequest(picked, repeats),
    quote: shown ?? all,
    unsettled: changed && (shown === undefined || narrowed.isFetching),
    toggle: (engine: LogicalEngine, on: boolean) =>
      setPicked(
        all.available_engines.filter((each) => (each === engine ? on : chosen.includes(each))),
      ),
    repeat: setRepeats,
    reset: () => {
      setPicked(null);
      setRepeats(null);
    },
  };
}

function QuoteFacts({
  quote,
  credits,
  choice,
}: Readonly<{
  quote: ProbeQuote;
  credits: string;
  choice: Pick<
    ReturnType<typeof useProbeChoice>,
    'available' | 'chosen' | 'toggle' | 'repetitions' | 'maxRepetitions' | 'repeat'
  >;
}>) {
  const { label } = useEngineCatalog();
  const none = choice.chosen.length === 0;
  const answers = none ? 0 : quote.answers;
  const spend = none ? 0 : quote.credits;
  const counts = Array.from({ length: choice.maxRepetitions }, (_, index) => String(index + 1));
  const facts = [
    {
      label: 'Engines',
      value: (
        <Inline wrap>
          {choice.available.map((engine) => (
            <Checkbox
              key={engine}
              label={label(engine)}
              checked={choice.chosen.includes(engine)}
              onCheckedChange={(checked) => choice.toggle(engine, checked === true)}
            />
          ))}
        </Inline>
      ),
    },
    { label: 'Markets', value: quote.markets.map(marketLabel).join(', ') },
    {
      label: 'Repetitions',
      value: (
        <RadioGroup
          ariaLabel="Repetitions"
          variant="inline"
          value={String(choice.repetitions)}
          onValueChange={(value) => choice.repeat(Number(value))}
          options={counts.map((count) => ({ value: count, label: count }))}
        />
      ),
    },
    {
      label: 'Prompts',
      value: `${quote.questions} per engine in each market it can measure, asked ${pluralCount(quote.repetitions, 'time')}`,
    },
    { label: 'Answers', value: formatCount(answers) },
    { label: credits, value: <b>{formatCount(spend)}</b> },
    {
      label: 'Balance after',
      value:
        quote.balance === null ? (
          <Absence state="unavailable" />
        ) : (
          `${formatCount(quote.balance - spend)} of ${formatCount(quote.balance)}`
        ),
    },
  ];
  return <FactList facts={facts} layout="ruled" />;
}

function Blocked({
  blocked,
  connecting,
  onConnected,
}: Readonly<{
  blocked: ProbeQuote['blocked'];
  connecting: boolean;
  onConnected: () => void;
}>) {
  switch (blocked) {
    case null:
      return null;
    case 'trial':
      return (
        <Notice tone="info" action={<TextLink href={PLANS_HREF}>See plans</TextLink>}>
          Market probes are not in the trial.
        </Notice>
      );
    case 'task_limit':
      return (
        <Notice tone="info">
          This probe asks more questions than one run allows. Remove a theme to run it.
        </Notice>
      );
    case 'no_key':
      return (
        <>
          <Notice tone="info">Add a key for an engine that searches.</Notice>
          {connecting ? <InlineProviderSetup connecting="any" onClose={onConnected} /> : null}
        </>
      );
    case 'no_market':
      return (
        <Notice tone="info">
          None of your engines can measure this project&apos;s markets. Add a market they support.
        </Notice>
      );
    default: {
      const unreachable: never = blocked;
      return unreachable;
    }
  }
}
