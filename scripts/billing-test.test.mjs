import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkSandboxEnvironment } from './billing-test.mjs';

const sandbox = {
  BILLING_RAZORPAY_MODE: 'test',
  BILLING_RAZORPAY_KEY_ID: 'rzp_test_abc',
  POSTGRES_DB: 'citeladder_billing_test',
  DEMO_MODE: 'false',
  DEV_LOGIN_PASSWORD: '',
  BILLING_RAZORPAY_LIVE_READY: 'false',
  PROVIDER_PLATFORM_OPENAI_API_KEY: '',
};

test('accepts an isolated test-mode sandbox environment', () => {
  assert.equal(checkSandboxEnvironment(sandbox), undefined);
});

test('refuses live mode, a shared database, bootstrap logins and live escape hatches', () => {
  for (const [change, message] of [
    [{ BILLING_RAZORPAY_MODE: 'live' }, /test mode and a test key/u],
    [{ BILLING_RAZORPAY_KEY_ID: 'rzp_live_abc' }, /test mode and a test key/u],
    [{ POSTGRES_DB: 'citeladder' }, /isolated database/u],
    [{ DEV_LOGIN_PASSWORD: 'secret' }, /isolated database/u],
    [{ BILLING_RAZORPAY_LIVE_READY: 'true' }, /escape hatches/u],
    [{ PROVIDER_PLATFORM_OPENAI_API_KEY: 'sk-x' }, /escape hatches/u],
  ]) {
    assert.throws(() => checkSandboxEnvironment({ ...sandbox, ...change }), message);
  }
});
