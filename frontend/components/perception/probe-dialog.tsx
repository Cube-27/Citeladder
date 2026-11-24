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
import { Inline, Stack } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { probeMutations, probeQueries, refreshProbeStatus } from '@/lib/api/probes';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { PLANS_HREF } from '@/lib/billing/plan-limit';
import { formatCount } from '@/lib/format';
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
  const choice = useEngineChoice(scope, all, intent !== null);
  const { quote, engines } = choice;
  const short = quote.balance !== null && quote.credits > quote.balance;
  const copy = COPY[intent?.kind === 'schedule' ? intent.cadence : 'run'];
  const pending = intent?.kind === 'schedule' ? schedule : run;
  const close = () => {
    run.reset();
    schedule.reset();
    setConnecting(true);
    choice.reset();
    onClose();
  };
  const confirm = () => {
    if (intent?.kind === 'schedule')
      schedule.mutate(
        {
          cadence: intent.cadence,
          fingerprint: quote.fingerprint,
          engines,
        },
        { onSuccess: close },
      );
    else run.mutate({ fingerprint: quote.fingerprint, engines }, { onSuccess: close });
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
      <Stack gap="item">
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
      </Stack>
    </Dialog>
  );
}

function useEngineChoice(scope: ProjectScope, all: ProbeQuote, open: boolean) {
  const [picked, setPicked] = useState<readonly LogicalEngine[] | null>(null);
  const chosen = picked ?? all.engines;
  const narrowed = useQuery({
    ...probeQueries.quote(scope, chosen),
    enabled: open && picked !== null && picked.length > 0,
  });
  return {
    available: all.available_engines,
    chosen,
    engines: picked ? [...picked] : undefined,
    quote: picked?.length && narrowed.data ? narrowed.data : all,
    unsettled: picked !== null && (picked.length === 0 || narrowed.isFetching || !narrowed.data),
    toggle: (engine: LogicalEngine, on: boolean) =>
      setPicked(
        all.available_engines.filter((each) => (each === engine ? on : chosen.includes(each))),
      ),
    reset: () => setPicked(null),
  };
}

function QuoteFacts({
  quote,
  credits,
  choice,
}: Readonly<{
  quote: ProbeQuote;
  credits: string;
  choice: Pick<ReturnType<typeof useEngineChoice>, 'available' | 'chosen' | 'toggle'>;
}>) {
  const { label } = useEngineCatalog();
  const facts = [
    {
      label: 'Engines',
      value: (
        <Inline className="flex-wrap">
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
      label: 'Questions',
      value: `${quote.questions} per engine in each market it can measure, asked ${quote.repetitions} times`,
    },
    { label: 'Answers', value: formatCount(quote.answers) },
    { label: credits, value: <b>{formatCount(quote.credits)}</b> },
    {
      label: 'Balance after',
      value:
        quote.balance === null ? (
          <Absence state="unavailable" />
        ) : (
          `${formatCount(quote.balance - quote.credits)} of ${formatCount(quote.balance)}`
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
