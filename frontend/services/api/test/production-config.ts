import { createHash } from 'node:crypto';

export const demoLoginPassword = createHash('sha256')
  .update('production-config-test-login')
  .digest('hex');

export const productionEnv = {
  APP_ENV: 'production',
  JWT_SECRET_KEY: 'session-fixture-key-with-enough-variety-12345',
  ENCRYPTION_KEY: 'encryption-fixture-key-with-enough-variety-67890',
  REFERRAL_HASH_SALT: 'referral-fixture-salt-with-enough-variety-abcde',
  API_KEY_PEPPER: 'api-key-fixture-pepper-with-enough-variety-fghij',
  DATABASE_URL:
    'postgresql://citeladder_app:database-fixture-password-0123456789@database.test/app',
  DB_SSL_MODE: 'require',
  TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128',
  FRONTEND_URL: 'https://app.example.test',
};
