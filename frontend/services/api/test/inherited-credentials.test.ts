import { expect, it } from 'vitest';
import { isInheritedCredential } from './inherited-credentials.ts';

it('refuses inherited provider credentials and secrets but keeps the local database and test settings', () => {
  const names = [
    'DATAFORSEO_API_LOGIN',
    'DATAFORSEO_API_PASSWORD',
    'DATAFORSEO_PLATFORM_CREDENTIAL_REF',
    'PROVIDER_PLATFORM_OPENAI_CREDENTIAL_REF',
    'PROVIDER_PLATFORM_OPENAI_API_KEY',
    'TURNSTILE_SECRET_KEY',
    'JWT_SECRET_KEY',
    'ENCRYPTION_KEY',
    'API_KEY_PEPPER',
    'DEV_LOGIN_PASSWORD',
    'OAUTH_GOOGLE_CLIENT_SECRET',
    'BILLING_RAZORPAY_WEBHOOK_SECRET',
    'RAZORPAY_TEST_KEY_SECRET',
    'POSTGRES_PASSWORD',
    'DATABASE_URL',
    'API_TEST_DATABASE_URL',
    'DATAFORSEO_BASE_URL',
    'APP_ENV',
    'CITELADDER_DISABLE_DOTENV',
  ];
  expect(names.filter(isInheritedCredential)).toEqual(names.slice(0, 13));
});
