'use client';

import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { ProviderConnection } from '@/lib/api/types';
import { ENGINE_DOMAINS, ENGINE_LOGOS, isConnectable, type EngineCardModel } from '@/lib/providers/catalog';
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
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandLogo
              name={model.label}
              logoUrl={ENGINE_LOGOS[model.logical_engine]}
              websiteUrl={ENGINE_DOMAINS[model.logical_engine]}
              size="sm"
            />
            <h3 className="text-foreground text-heading-sm font-semibold">{model.label}</h3>
          </div>
          <ConnectionStateBadge model={model} />
        </CardHeader>

        <CardContent className="grid gap-3.5">
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
            <div className="bg-background-alt border-border-subtle grid gap-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-muted text-2xs font-semibold uppercase tracking-wider">Route</span>
                <span className="text-foreground text-xs font-medium">{route.label}</span>
              </div>
              <div className="text-muted grid gap-1 font-mono text-2xs">
                <div className="flex items-center justify-between">
                  <span>Pulse</span>
                  <span className="text-secondary">{route.pulse_model}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Benchmark</span>
                  <span className="text-secondary">{route.benchmark_model}</span>
                </div>
              </div>
            </div>
          ) : null}

          {connectable ? (
            <div className="grid gap-3 pt-1">
              <EngineConnectionFields state={connectionState} />

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={busy || !transport || (!apiKey && !configured)}
                >
                  {saveMutation.isPending ? 'Saving…' : configured ? 'Update key' : 'Save key'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => testMutation.mutate()}
                  disabled={busy || !connection}
                >
                  {testMutation.isPending ? 'Testing…' : 'Test connection'}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </div>
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
