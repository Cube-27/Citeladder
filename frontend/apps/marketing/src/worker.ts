import { handle } from '@astrojs/cloudflare/handler';

import { dispatchRequest } from './host-dispatch';

type AstroArgs = Parameters<typeof handle>;
type MarketingEnv = AstroArgs[1] & { LOCAL_WORKER_ORIGIN?: string };

/** Worker entry for both custom domains; `dispatchRequest` owns the host split. */
const marketingWorker = {
  fetch(request: Request, env: MarketingEnv, context: AstroArgs[2]) {
    return dispatchRequest(request, env, (next) => handle(next, env, context));
  },
};

export default marketingWorker;
