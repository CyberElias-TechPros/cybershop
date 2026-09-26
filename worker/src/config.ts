export interface Env {
  DB: D1Database;
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
  PAYSTACK_PUBLIC_KEY: string;
  PAYSTACK_SECRET_KEY: string;
  PAYSTACK_WEBHOOK_URL: string;
  SEED_ADMIN_EMAIL?: string;
  SEED_ADMIN_PASSWORD?: string;
  // --- transactional email (optional; mail is a logged no-op when unset) ---
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
  MAIL_ENDPOINT?: string;
  /** Optional. When set, a verified custom domain is attached to the Vercel project for TLS. */
  VERCEL_TOKEN?: string;
  VERCEL_PROJECT_ID?: string;
  VERCEL_TEAM_ID?: string;
}

export const SESSION_COOKIE = 'cs_session';
export const VISITOR_COOKIE = 'cs_visitor';
export const SESSION_DAYS = 30;

export const paystackMock = (env: Env) => env.PAYSTACK_MOCK === '1';
