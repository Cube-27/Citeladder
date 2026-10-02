import { z } from 'zod';
import type { ServiceConfig } from '../config.ts';
import { getLogger } from '../logging.ts';

const tokenSchema = z.object({ access_token: z.string().min(1) });

/** Start an execution, never wait for its work. A missed start is recovered by tick. */
export function runnerStarter(
  config: ServiceConfig,
  send: typeof fetch = fetch,
): () => Promise<void> {
  return async () => {
    if (!config.execution.runnerJob) return;
    const signal = AbortSignal.timeout(config.execution.wakeTimeoutMs);
    try {
      const tokenResponse = await send(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        {
          headers: { 'Metadata-Flavor': 'Google' },
          redirect: 'error',
          signal,
        },
      );
      if (!tokenResponse.ok) throw new Error('metadata_token_unavailable');
      const { access_token } = tokenSchema.parse(await tokenResponse.json());
      const response = await send(
        `https://run.googleapis.com/v2/${config.execution.runnerJob}:run`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: '{}',
          redirect: 'error',
          signal,
        },
      );
      // Consume the small operation response before returning the API response.
      await response.body?.cancel();
      if (!response.ok) throw new Error('runner_start_rejected');
    } catch {
      // Never disclose Google response bodies/tokens, or turn a committed write into an error.
      getLogger('workers.runner').warning('runner_start_failed');
    }
  };
}
