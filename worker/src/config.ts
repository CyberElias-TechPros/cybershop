export interface Env {
  DB: D1Database;
  RELEASE_SHA?: string;
  APP_ENV?: 'development' | 'staging' | 'production';
  AUTH_SECRET: string;
  INTERNAL_SECRET: string;
  GATEWAY_SECRET: string;
  APP_URL: string;
  WEB_ORIGIN: string;
  SESSION_SECURE: string;
  IP_SALT: string;
  MEDIA_DRIVER: 'd1' | 'gateway';
  MEDIA_BASE_URL: string;
  GATEWAY_PUBLIC_URL: string;
  PAYSTACK_MOCK: string;
  /** New buyer deposit collection is off until money-flow/legal/operations sign-off. */
  BUYER_DEPOSITS_ENABLED?: string;
  PAYSTACK_PUBLIC_KEY: string;
  PAYSTACK_SECRET_KEY: string;
  PAYSTACK_WEBHOOK_URL: string;
  SEED_ADMIN_EMAIL?: string;
  SEED_ADMIN_PASSWORD?: string;
  // --- transactional email (provider + sender required for hosted readiness) ---
  RESEND_API_KEY?: string;
  /** Independent AES-GCM outbox key; AUTH_SECRET fallback is local-development only. */
  MAIL_OUTBOX_KEY?: string;
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
  MAIL_ENDPOINT?: string;
  /**
   * When '1', an admin without two-factor authentication cannot use the admin
   * console at all — they are sent to set it up. Off by default so a fresh
   * install is not locked out on day one; turn it on once every admin is
   * enrolled (see docs/production.md).
   */
  REQUIRE_ADMIN_2FA?: string;
  /** Optional. When set, a verified custom domain is attached to the Vercel project for TLS. */
  VERCEL_TOKEN?: string;
  VERCEL_PROJECT_ID?: string;
  VERCEL_TEAM_ID?: string;
}

export const SESSION_COOKIE = 'cs_session';
export const VISITOR_COOKIE = 'cs_visitor';
export const SESSION_DAYS = 30;

// Mock money is permitted only on local HTTP development, never on a hosted profile.
export const paystackMock = (env: Env) => env.PAYSTACK_MOCK === '1' &&
  (!env.APP_ENV || env.APP_ENV === 'development') && env.SESSION_SECURE !== '1' &&
  !/^https:/i.test(env.APP_URL || '');

/** Keep historical mock tests usable; real collection requires an explicit controlled opt-in. */
export const buyerDepositsEnabled = (env: Env) => paystackMock(env) || env.BUYER_DEPOSITS_ENABLED === '1';
