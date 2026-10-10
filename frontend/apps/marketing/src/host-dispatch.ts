import { isApiHostRequest, routeApiHostRequest, type ApiHostEnv } from './api-host-route';

export type DispatchEnv = ApiHostEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

/**
 * One Worker serves two hosts with assets behind it (`run_worker_first`). The
 * API host never reaches the assets or Astro. The marketing host keeps the
 * asset layer's behaviour from before: a GET or HEAD the assets answer
 * (files, prerendered pages, trailing-slash redirects, `_headers`) is served
 * as is, and only an asset miss or another method renders in Astro.
 */
export async function dispatchRequest(
  request: Request,
  env: DispatchEnv,
  render: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (isApiHostRequest(request, env)) return routeApiHostRequest(request, env);
  if (request.method === 'GET' || request.method === 'HEAD') {
    const asset = await env.ASSETS.fetch(request.clone());
    if (asset.status !== 404) return asset;
  }
  return render(request);
}
