/** Deterministic deployment fixture, never a live credential or endpoint. */
export const productionEnv = {
  APP_ENV: 'production',
  JWT_SECRET_KEY: 'session-fixture-key-with-enough-variety-12345',
  ENCRYPTION_KEY: 'encryption-fixture-key-with-enough-variety-67890',
  REFERRAL_HASH_SALT: 'referral-fixture-salt-with-enough-variety-abcde',
  DATABASE_URL:
    'postgresql+asyncpg://fixture:database-fixture-password-0123456789@database.test/app',
  DB_SSL_MODE: 'require',
  TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128',
  DEV_LOGIN_PASSWORD: 'login-fixture-12345',
  FRONTEND_URL: 'https://app.example.test',
};
