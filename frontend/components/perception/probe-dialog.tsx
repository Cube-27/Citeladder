import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { marketLabel } from '@citeladder/contracts/markets';
import type { ProbeQuote } from '@citeladder/contracts/probes';

import { InlineProviderSetup } from '@/components/runs/launch-dialog-view';
import { Absence } from '@/components/ui/absence';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FactList } from '@/components/ui/facts';
import { Stack } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { probeMutations } from '@/lib/api/probes';
import { queryKeys } from '@/lib/api/query-keys';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { PLANS_HREF } from '@/lib/billing/plan-limit';
import { useEngineCatalog } from '@/lib/providers/engines';

const count = new Intl.NumberFormat('en-US');

/** Confirm a probe before it spends: what it asks, and the AI credits it costs (AV-34). */
export function ProbeDialog({
  scope,
  quote,
  open,
  onOpenChange,
}: Readonly<{
  scope: ProjectScope;
  quote: ProbeQuote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const client = useQueryClient();
  const run = useMutation(probeMutations.run(scope));
  const { label } = useEngineCatalog();
  const [connecting, setConnecting] = useState(true);
  const noKey = quote.engines.length === 0;
  const short = quote.balance !== null && quote.credits > quote.balance;
  const close = (next: boolean) => {
    if (!next) {
      run.reset();
      setConnecting(true);
    }
    onOpenChange(next);
  };
  const facts = [
    { label: 'Engines', value: quote.engines.map(label).join(', ') },
    { label: 'Markets', value: quote.markets.map(marketLabel).join(', ') },
    {
      label: 'Questions',
      value: `${quote.questions} per engine and market, asked ${quote.repetitions} times`,
    },
    { label: 'Answers', value: count.format(quote.answers) },
    { label: 'Cost', value: <b>{count.format(quote.credits)} AI credits</b> },
    {
      label: 'Balance after',
      value:
        quote.balance === null ? (
          <Absence state="unavailable" />
        ) : (
          `${count.format(quote.balance - quote.credits)} of ${count.format(quote.balance)}`
        ),
    },
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Run a market probe"
      description="Each engine answers what you're known for, which brands lead each theme, and why a buyer might not choose you."
      footer={
        <>
          <Button variant="quiet" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={noKey || short}
            pending={run.isPending}
            onClick={() => run.mutate(quote.fingerprint, { onSuccess: () => close(false) })}
          >
            Run probe
          </Button>
        </>
      }
    >
      <Stack gap="item">
        {run.isError ? (
          <Notice
            kind="mutation"
            notice={mutationNoticeForError(run.error, { action: 'run the probe' })}
          />
        ) : null}
        {short ? (
          <Notice tone="warning" action={<TextLink href={PLANS_HREF}>See plans</TextLink>}>
            Not enough AI credits.
          </Notice>
        ) : null}
        {noKey ? (
          <>
            <Notice tone="info">Add a key for an engine that searches.</Notice>
            {connecting ? (
              <InlineProviderSetup
                connecting="any"
                onClose={() => {
                  setConnecting(false);
                  void client.invalidateQueries({ queryKey: queryKeys.projects.probes(scope) });
                }}
              />
            ) : null}
          </>
        ) : (
          <FactList facts={facts} layout="ruled" />
        )}
      </Stack>
    </Dialog>
  );
}
