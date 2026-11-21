import { afterAll, describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

import { createApp } from '../src/app.ts';
import { executionSettings } from '../src/config/execution.ts';
import { setLogSink } from '../src/logging.ts';
import { testConfig, testDatabase } from './support.ts';

const db = testDatabase(testConfig());
afterAll(() => db.destroy());

const invoker = 'citeladder-scheduler@project.iam.gserviceaccount.com';
const audience = 'citeladder-api/internal/tick';
const protectedEnv = {
  K_SERVICE: 'api',
  CITELADDER_ORIGIN_TOKEN: 'current-origin-token-0123456789abcdef',
};

const google = await generateKeyPair('RS256');
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(google.publicKey)), kid: 'k1' }] });

function idToken(claims: { email: string; aud: string; iss?: string }) {
  return new SignJWT({ email: claims.email, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(claims.iss ?? 'https://accounts.google.com')
    .setAudience(claims.aud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(google.privateKey);
}

describe('scheduled tick', () => {
  const app = createApp(
    testConfig({
      ...protectedEnv,
      SCHEDULER_TICK_INVOKER: invoker,
      SCHEDULER_TICK_AUDIENCE: audience,
    }),
    db,
    { startRunner: async () => true, schedulerKeys: keys },
  );
  const tick = async (authorization?: string) => {
    const response = await app.request('/internal/tick', {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : {},
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  it('runs every periodic owner for the scheduler identity without an origin signature', async () => {
    const phases: string[] = [];
    const sizes: unknown[] = [];
    const restore = setLogSink((line) => {
      const record = JSON.parse(line) as { event?: string; phase?: string; size_bytes?: unknown };
      if (record.event === 'tick_phase_completed' && record.phase) phases.push(record.phase);
      if (record.event === 'database_size_observed') sizes.push(record.size_bytes);
    });
    try {
      const result = await tick(`Bearer ${await idToken({ email: invoker, aud: audience })}`);
      expect(result.status).toBe(200);
      expect(result.body.status).toBe('ok');
    } finally {
      setLogSink(restore);
    }
    expect(phases).toEqual([
      'database-size',
      'mcp-protocol-cleanup',
      'api-idempotency-cleanup',
      'usage-window-cleanup',
      'security-event-retention',
      'trial-data-purge',
      'signup-notices',
      'audit-maintenance',
      'research-recovery',
      'audit-scheduler',
      'crawl-scheduler',
      'integration-dispatcher',
      'crawl-log-maintenance',
      'billing-recovery',
    ]);
    expect(sizes).toEqual([expect.any(Number)]);
    expect(sizes[0]).toBeGreaterThan(1_000_000);
  });

  it('refuses a missing token, another identity, another audience and another issuer', async () => {
    const other = 'someone@project.iam.gserviceaccount.com';
    const statuses = [
      (await tick()).status,
      (await tick('Bearer not-a-jwt')).status,
      (await tick(`Bearer ${await idToken({ email: other, aud: audience })}`)).status,
      (await tick(`Bearer ${await idToken({ email: invoker, aud: 'elsewhere' })}`)).status,
      (
        await tick(
          `Bearer ${await idToken({ email: invoker, aud: audience, iss: 'https://attacker.example' })}`,
        )
      ).status,
    ];
    expect(statuses).toEqual([403, 403, 403, 403, 403]);
  });

  it('is not served without a configured scheduler, so the origin token still applies', async () => {
    const unscheduled = createApp(testConfig(protectedEnv), db, {
      startRunner: async () => true,
      schedulerKeys: keys,
    });
    const response = await unscheduled.request('/internal/tick', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await idToken({ email: invoker, aud: audience })}` },
    });
    expect(response.status).toBe(403);
  });
});

it('requires the scheduler identity and audience together', () => {
  expect(() => executionSettings({ SCHEDULER_TICK_INVOKER: invoker })).toThrow(
    'Set SCHEDULER_TICK_INVOKER and SCHEDULER_TICK_AUDIENCE together',
  );
  expect(
    executionSettings({
      SCHEDULER_TICK_INVOKER: invoker,
      SCHEDULER_TICK_AUDIENCE: audience,
      SCHEDULER_TICK_BUDGET_SECONDS: '45',
    }).scheduledTick,
  ).toEqual({ invoker, audience, budgetSeconds: 45 });
  expect(executionSettings({}).scheduledTick).toBeNull();
});
