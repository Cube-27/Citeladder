'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardEyebrow, CardHeader } from '@/components/ui/card';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import type { ProviderConnection } from '@/lib/api/types';
import { isConnectable, TRANSPORT_LABELS, type EngineCardModel } from '@/lib/providers/catalog';
import { useEngineConnection } from '@/lib/providers/use-engine-connection';

import { EngineConnectionFields } from './engine-connection-fields';

/**
 * Per-engine provider card (F8, v2 direct-provider retirement).
 *
 * Renders one logical engine served by a single fixed direct transport
 * (ChatGPT/OpenAI, Gemini/Google, Claude/Anthropic): a write-only API-key
 * input (never pre-filled — the stored secret is never on the wire), a "Test
 * connection" action, and a `configured` status badge driven by the
 * connection's `api_key_set` flag. The save/test state machine lives in the
 * shared `useEngineConnection` hook (Task 3.2) so the guided connect dialog
 * behaves identically.
 */
export function EngineCard({
  model,
  connections,
}: Readonly<{ model: EngineCardModel; connections: ProviderConnection[] }>) {
  const connectionState = useEngineConnection({ model, connections });
  const { route, transport, connection, configured, apiKey, saveMutation, testMutation, busy } =
    connectionState;
  const connectable = isConnectable(model);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="grid gap-1">
          <CardEyebrow>AI engine</CardEyebrow>
          <h3 className="text-foreground text-heading-sm">{model.label}</h3>
          <div className="flex items-center gap-2">
            {transport ? (
              <Badge variant="neutral">via {TRANSPORT_LABELS[transport]}</Badge>
            ) : (
              <span className="text-muted text-xs">No route available</span>
            )}
          </div>
        </div>
        <ConnectionStateBadge model={model} />
      </CardHeader>

      <CardContent className="grid gap-4">
        {model.state === 'missing' && (
          <p className="text-muted text-xs">
            {model.safe_reason ?? 'Verification required — save a key and run a connection test.'}
          </p>
        )}
        {model.state === 'failed' && model.latest_probe && (
          <p className="text-danger-text text-xs">
            Last test failed
            {model.latest_probe.safe_reason ? `: ${model.latest_probe.safe_reason}` : ''}
            {model.latest_probe.model ? ` (model ${model.latest_probe.model})` : ''}.
          </p>
        )}
        {model.availability === 'unavailable' && (
          <p className="text-muted text-xs">
            {model.unavailable_reason === 'adapter_not_shipped'
              ? 'Coming soon — this provider has no adapter yet and cannot be connected.'
              : (model.unavailable_reason ?? 'Not available for connection.')}
          </p>
        )}
        {route ? (
          <div className="grid gap-1.5">
            <span className={eyebrowClasses}>Route</span>
            <span className="text-foreground text-sm">{route.label}</span>
            {route.default_model ? (
              <span className="text-2xs text-muted font-mono">Model: {route.default_model}</span>
            ) : null}
          </div>
        ) : null}

        {/* A planned provider gets no key input and no actions. The card
            stays keyboard-reachable and informative, but there is nothing to
            submit — a stored key for an adapter that does not exist would be a
            credential we could never use. */}
        {connectable ? (
          <>
            <EngineConnectionFields state={connectionState} />

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={busy || !transport || (!apiKey && !configured)}
              >
                {saveMutation.isPending ? 'Saving…' : configured ? 'Update key' : 'Save key'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => testMutation.mutate()}
                disabled={busy || !connection}
              >
                {testMutation.isPending ? 'Testing…' : 'Test connection'}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The four-state badge. `connected` requires a SUCCESSFUL probe, not a stored
 * key: "we have a credential" and "the credential works" are different facts,
 * and only the second one should look green.
 */
function ConnectionStateBadge({ model }: Readonly<{ model: EngineCardModel }>) {
  if (model.state === 'connected') {
    return (
      <Badge variant="status" value="success">
        Connected
      </Badge>
    );
  }
  if (model.state === 'failed') {
    return (
      <Badge variant="status" value="danger">
        Failed
      </Badge>
    );
  }
  if (model.state === 'unavailable') {
    return <Badge variant="neutral">Coming soon</Badge>;
  }
  return <Badge variant="neutral">Missing</Badge>;
}
