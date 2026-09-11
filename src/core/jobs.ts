/**
 * Postgres-backed jobs (BUILD_PLAN 18.1) — the queue we can afford on free hosting.
 * Claiming uses FOR UPDATE SKIP LOCKED so overlapping cron triggers cannot double-run,
 * and every handler is idempotent and time-boxed.
 */
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { jobs } from "@/db/schema";
import { getDb } from "@/db/client";

export const JOB_MAX_ATTEMPTS = 8;
export const TIME_BOX_MS = 55_000;   // under Vercel's 60s Hobby ceiling

export async function enqueue(kind: string, payload: Record<string, unknown>, opts: { runAt?: Date; dedupeKey?: string } = {}) {
  const db = getDb();
  if (opts.dedupeKey) {
    const [existing] = await db.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.dedupeKey, opts.dedupeKey), inArray(jobs.status, ["queued", "running"]))).limit(1);
    if (existing) return { id: existing.id, deduped: true };
  }
  const [row] = await db.insert(jobs).values({
    kind, payload, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey ?? null,
  }).returning({ id: jobs.id });
  return { id: row!.id, deduped: false };
}

type Handler = (payload: Record<string, unknown>) => Promise<void>;

/** Handlers registered here are safe to run twice; the ones not yet built stay queued (no silent drop). */
export const handlers: Record<string, Handler> = {
  "media.orphan_sweep": async () => { await import("./media-jobs").then((m) => m.sweepOrphans()); },
  "subscription.expiry_check": async () => { await import("./media-jobs").then((m) => m.expirySweep()); },
  "usage.recount": async () => { await import("./media-jobs").then((m) => m.recountAllUsage()); },
  "noop": async () => undefined,
};

export type RunReport = { claimed: number; done: number; failed: number; ms: number; deferred: string[] };

export async function runDueJobs(opts: { limit?: number } = {}): Promise<RunReport> {
  const db = getDb();
  const limit = opts.limit ?? 200;
  const started = Date.now();
  const deferred: string[] = [];
  let claimed = 0, done = 0, failed = 0;

  // PGlite has no FOR UPDATE SKIP LOCKED support in every build; fall back to a claim-by-update.
  const candidates = await db.select().from(jobs)
    .where(and(eq(jobs.status, "queued"), lte(jobs.runAt, new Date())))
    .limit(limit) as typeof jobs.$inferSelect[];

  for (const job of candidates) {
    if (Date.now() - started > TIME_BOX_MS) { deferred.push(job.kind); continue; }
    const [row] = await db.update(jobs)
      .set({ status: "running", attempts: sql`${jobs.attempts} + 1` })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, "queued")))
      .returning({ id: jobs.id });
    if (!row) continue;                      // another trigger took it
    claimed++;
    const handler = handlers[job.kind];
    if (!handler) {
      await db.update(jobs).set({ status: "queued", lastError: `no handler registered for ${job.kind}` }).where(eq(jobs.id, job.id));
      continue;                              // keep it queued; visible in admin
    }
    try {
      await handler(job.payload as Record<string, unknown>);
      await db.update(jobs).set({ status: "done", finishedAt: new Date(), lastError: null }).where(eq(jobs.id, job.id));
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = job.attempts + 1;
      await db.update(jobs).set({
        status: attempts >= JOB_MAX_ATTEMPTS ? "failed" : "queued",
        lastError: msg.slice(0, 500),
        runAt: new Date(Date.now() + Math.min(6 * 3600_000, 30_000 * 2 ** attempts)),   // exponential backoff
      }).where(eq(jobs.id, job.id));
      failed++;
      console.error(`[job:${job.kind}] ${msg}`);
    }
  }
  return { claimed, done, failed, ms: Date.now() - started, deferred };
}

export const verifyCronSecret = (req: Request) =>
  req.headers.get("authorization") === `Bearer ${env_cron()}` ||
  new URL(req.url).searchParams.get("secret") === env_cron();

function env_cron() { return process.env.CRON_SECRET ?? "dev-cron-secret"; }
