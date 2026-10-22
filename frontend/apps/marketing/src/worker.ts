import { handle } from '@astrojs/cloudflare/handler';
import type { WorkerEnv as GeneratedEnv } from '../worker-configuration';
import { serveMarketingRequest } from './edge';

// Local Wrangler sets this binding; production never does.
type WorkerEnv = GeneratedEnv & { LOCAL_WORKER_ORIGIN?: string };
type WorkerContext = Parameters<typeof handle>[2];

const marketingWorker = {
  fetch: (request: Request, env: WorkerEnv, context: WorkerContext) =>
    serveMarketingRequest(request, env, (rendered) => handle(rendered, env, context)),
};

export default marketingWorker;
