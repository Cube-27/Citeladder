declare module 'cloudflare:workers' {
  export const env: import('../worker-configuration').WorkerEnv;
}

/** Workers expose the zone's edge cache as `caches.default`. */
interface CacheStorage {
  readonly default: Cache;
}
