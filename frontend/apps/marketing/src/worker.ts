import { handle } from '@astrojs/cloudflare/handler';
import { serveMarketingRequest } from './edge';

// Local Wrangler sets this binding; production never does.
type WorkerEnv = Env & { LOCAL_WORKER_ORIGIN?: string };

const marketingWorker = {
  fetch: (request: Request, env: WorkerEnv, context: ExecutionContext) =>
    serveMarketingRequest(request, env, (rendered) => handle(rendered, env, context)),
};

export default marketingWorker;
