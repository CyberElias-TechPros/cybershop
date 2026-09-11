/** Validated environment (BUILD_PLAN 4: the only reader of process.env). */
import { z } from "zod";

const Bool = (d: boolean) =>
  z.enum(["1", "0", "true", "false"]).optional().transform((v) => (v === undefined ? d : v === "1" || v === "true"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** unset -> embedded PGlite at ./.data/pgdata (zero-setup dev) */
  DATABASE_URL: z.string().optional(),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  MEDIA_DRIVER: z.enum(["local", "gateway", "sftp"]).default("local"),
  MEDIA_PUBLIC_BASE_URL: z.string().optional(),
  MEDIA_GATEWAY_URL: z.string().url().optional(),
  MEDIA_GATEWAY_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().default("dev-only-insecure-session-secret"),
  CRON_SECRET: z.string().default("dev-cron-secret"),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  MAINTENANCE: Bool(false),
});

const parsed = schema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL || undefined,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
  MEDIA_DRIVER: process.env.MEDIA_DRIVER,
  MEDIA_PUBLIC_BASE_URL: process.env.MEDIA_PUBLIC_BASE_URL,
  MEDIA_GATEWAY_URL: process.env.MEDIA_GATEWAY_URL,
  MEDIA_GATEWAY_SECRET: process.env.MEDIA_GATEWAY_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  MAINTENANCE: process.env.MAINTENANCE,
});

export const env = {
  ...parsed,
  isProd: parsed.NODE_ENV === "production",
  /** Paystack UI/paths stay hidden until keys exist (plan.md 0: dual method, graceful degradation) */
  paystackEnabled: Boolean(parsed.PAYSTACK_SECRET_KEY),
  mediaBaseUrl: parsed.MEDIA_PUBLIC_BASE_URL ?? "/__media",
  get appOrigin() {
    return new URL(parsed.PUBLIC_APP_URL).origin;
  },
};
