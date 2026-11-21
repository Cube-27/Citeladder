export const turnstile = {
  verify_url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  verify_timeout_ms: 5_000,
  /** Cloudflare's documented maximum token length. */
  token_max_length: 2_048,
  actions: {
    signup: 'signup',
    login: 'login',
    'resend-verification': 'resend-verification',
    'forgot-password': 'forgot-password',
  },
  /**
   * Cloudflare's documented test secrets and the outcome each always gives.
   * They are answered here without a network call, and only in a development
   * or test environment: anywhere else a test secret counts as unconfigured.
   */
  test_secrets: new Map<string, 'pass' | 'fail'>([
    ['1x0000000000000000000000000000000AA', 'pass'],
    ['2x0000000000000000000000000000000AA', 'fail'],
    ['3x0000000000000000000000000000000AA', 'fail'],
  ]),
  /** The only token Cloudflare's test secrets accept. */
  test_token: 'XXXX.DUMMY.TOKEN.XXXX',
  development_secret: '1x0000000000000000000000000000000AA',
} as const;

export type TurnstileAction = keyof typeof turnstile.actions;
