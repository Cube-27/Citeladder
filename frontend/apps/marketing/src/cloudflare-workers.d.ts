declare module 'cloudflare:workers' {
  export const env: import('../worker-configuration').WorkerEnv;
}

interface CacheStorage {
  readonly default: Cache;
}
