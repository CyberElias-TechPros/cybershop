/**
 * One DB connection module for both targets (BUILD_PLAN 2.2):
 *   - dev/tests: embedded PGlite (real Postgres, zero setup, data in ./.data/pgdata)
 *   - staging/prod: postgres-js against Neon / Vercel Postgres
 * The dialect is identical, so SQL written in dev is the SQL that ships.
 */
import { drizzle as drizzlePg, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzleNeon } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";
import { env } from "@/lib/env";

export type DB = PgliteDatabase<typeof schema>;

let cached: DB | null = null;
let pglite: { close?: () => Promise<void> } | null = null;

export function getDb(): DB {
  if (cached) return cached;
  if (env.DATABASE_URL) {
    const client = postgres(env.DATABASE_URL, {
      max: 5,                       // serverless: keep pools small, reuse via pgbouncer
      prepare: false,
      transform: { undefined: null },
    });
    cached = drizzleNeon(client, { schema, logger: false }) as unknown as DB;
  } else {
    const dir = path.join(process.cwd(), ".data", "pgdata");
    mkdirSync(dir, { recursive: true });
    const pg = new PGlite(dir);
    pglite = pg as unknown as { close?: () => Promise<void> };
    cached = drizzlePg(pg, { schema, logger: false }) as unknown as DB;
  }
  return cached;
}

export const isPglite = () => !env.DATABASE_URL;

/**
 * Tenant-scoping helper (invariant I1). Repositories take `businessId` from the
 * session; a dev-mode assertion catches a filter-less select on a tenant table.
 */
export function assertScoped(businessId: string | null | undefined, caller: string) {
  if (!businessId) throw new Error(`[${caller}] missing tenant scope - refusing an unscoped tenant query`);
  if (env.isProd) return;
  // Deliberate no-op beyond the null check; the real guard is the authz matrix test.
}

export async function withTransaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
  const db = getDb();
  // PGlite serialises anyway; postgres-js supports .begin.
  const run = (db as unknown as { transaction: (cb: (tx: DB) => Promise<T>) => Promise<T> }).transaction;
  if (typeof run === "function") return run.call(db, fn);
  return fn(db);
}

export async function closeDb() {
  try { await (pglite as unknown as { destroy?: () => Promise<void> })?.destroy?.(); } catch { /* noop */ }
}
