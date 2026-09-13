import { useQuery } from '@tanstack/react-query';

import { authApi } from '@/lib/api/auth';
import { httpErrorStatus, humanizeApiError } from '@/lib/api/errors';
import type { SessionUser } from '@/lib/api/types';

const SESSION_ENDPOINT = '/api/v1/auth/me';
const SESSION_PROBE_KEY = ['migration', 'session-probe'] as const;

type SessionProbeResult =
  | { kind: 'authenticated'; user: SessionUser }
  | { kind: 'unauthenticated' };

async function probeSession(signal: AbortSignal): Promise<SessionProbeResult> {
  try {
    return {
      kind: 'authenticated',
      user: await authApi.me({ signal }),
    };
  } catch (error) {
    if (httpErrorStatus(error) === 401) return { kind: 'unauthenticated' };
    throw error;
  }
}

function ProbeState({ result }: { result: SessionProbeResult }) {
  if (result.kind === 'unauthenticated') {
    return (
      <section
        aria-labelledby="session-state"
        className="border-warning-border bg-warning-bg rounded-[var(--radius-card)] border p-5"
      >
        <p className="text-warning-text text-xs font-medium tracking-wide uppercase">
          Unauthenticated
        </p>
        <h2 id="session-state" className="mt-2 text-lg">
          No active session
        </h2>
        <p className="text-warning-text mt-2 text-sm">
          The API returned 401, so this browser origin does not currently have an authenticated
          session.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="session-state"
      className="border-success-border bg-success-bg rounded-[var(--radius-card)] border p-5"
    >
      <p className="text-success-text text-xs font-medium tracking-wide uppercase">Authenticated</p>
      <h2 id="session-state" className="mt-2 text-lg">
        Session transport succeeded
      </h2>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">Email</dt>
        <dd className="text-foreground break-all">{result.user.email}</dd>
        <dt className="text-muted">Account role</dt>
        <dd className="text-foreground">{result.user.role}</dd>
      </dl>
    </section>
  );
}

function TransportFailure({ error }: { error: unknown }) {
  const detail = humanizeApiError(error, 'The session endpoint could not be reached.');

  return (
    <section
      aria-labelledby="session-state"
      role="alert"
      className="border-danger-border bg-danger-bg rounded-[var(--radius-card)] border p-5"
    >
      <p className="text-danger-text text-xs font-medium tracking-wide uppercase">
        Transport failure
      </p>
      <h2 id="session-state" className="mt-2 text-lg">
        Session could not be verified
      </h2>
      <p className="text-danger-text mt-2 text-sm">{detail.message}</p>
      {detail.status || detail.requestId ? (
        <p className="text-muted mt-3 font-mono text-xs">
          {[
            detail.status ? `HTTP ${detail.status}` : null,
            detail.requestId ? `ref ${detail.requestId}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
    </section>
  );
}

export function SessionProbe() {
  const session = useQuery({
    queryKey: SESSION_PROBE_KEY,
    queryFn: ({ signal }) => probeSession(signal),
    retry: false,
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl items-center px-6 py-16">
      <div className="w-full">
        <p className="text-accent-text text-xs font-medium tracking-wide uppercase">
          Migration acceptance route
        </p>
        <h1 className="mt-3 text-2xl">Vite application runtime</h1>
        <p className="text-muted mt-3 max-w-xl text-sm leading-relaxed">
          This internal page verifies React Router, TanStack Query, shared CSS, and a relative,
          cookie-bearing request to <code className="font-mono">{SESSION_ENDPOINT}</code>. It does
          not redirect, clear cached state, or manage the session.
        </p>

        <div className="mt-8" aria-live="polite">
          {session.isPending ? (
            <section
              aria-labelledby="session-state"
              role="status"
              className="border-info-border bg-info-bg rounded-[var(--radius-card)] border p-5"
            >
              <p className="text-info-text text-xs font-medium tracking-wide uppercase">Checking</p>
              <h2 id="session-state" className="mt-2 text-lg">
                Probing the session endpoint…
              </h2>
            </section>
          ) : session.isError ? (
            <TransportFailure error={session.error} />
          ) : (
            <ProbeState result={session.data} />
          )}
        </div>

        {!session.isPending ? (
          <button
            type="button"
            onClick={() => void session.refetch()}
            disabled={session.isFetching}
            className="border-border-strong bg-panel text-foreground hover:bg-background-alt focus-visible:outline-accent mt-5 rounded-[var(--radius-control)] border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            {session.isFetching ? 'Probing…' : session.isError ? 'Retry probe' : 'Probe again'}
          </button>
        ) : null}
      </div>
    </main>
  );
}
