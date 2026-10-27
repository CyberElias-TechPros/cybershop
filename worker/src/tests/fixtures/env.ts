import type { Env } from '../../config';

/** Synthetic values only. Never load developer or provider credentials into tests. */
export function productionEnv(overrides: Partial<Env> = {}): Env {
  return {
    APP_ENV: 'production', AUTH_SECRET: 'a'.repeat(64), INTERNAL_SECRET: 'b'.repeat(64),
    IP_SALT: 'c'.repeat(64), GATEWAY_SECRET: 'd'.repeat(64), SESSION_SECURE: '1',
    APP_URL: 'https://cybershop.ng', WEB_ORIGIN: 'https://cybershop.ng',
    MEDIA_DRIVER: 'd1', MEDIA_BASE_URL: 'https://cybershop.ng', GATEWAY_PUBLIC_URL: 'https://media.cybershop.ng',
    PAYSTACK_MOCK: '0', PAYSTACK_SECRET_KEY: 'sk_live_synthetic_not_a_real_key',
    PAYSTACK_PUBLIC_KEY: 'pk_live_synthetic_not_a_real_key',
    PAYSTACK_WEBHOOK_URL: 'https://api.cybershop.ng/api/webhooks/paystack',
    MAIL_OUTBOX_KEY: 'e'.repeat(64), RESEND_API_KEY: 'synthetic-mail-key', MAIL_FROM: 'CyberShop <noreply@cybershop.ng>', REQUIRE_ADMIN_2FA: '1',
    DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) } as unknown as D1Database,
    ...overrides,
  };
}
