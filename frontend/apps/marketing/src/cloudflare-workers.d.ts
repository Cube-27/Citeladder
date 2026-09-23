declare module 'cloudflare:workers' {
  export const env: import('../worker-configuration').WorkerEnv & {
    LOCAL_WORKER_ORIGIN?: string;
  };
}
