/**
 * Operational CLI: npm run db:migrate | db:seed | db:reset | jobs:run | verify
 * Uses the app's own connection module so the CLI and the server never open two
 * Postgres instances on one PGlite data directory.
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb, closeDb, isPglite } from "../src/db/client";

const MIGRATIONS = path.join(process.cwd(), "drizzle");

function statements(file: string): string[] {
  return readFileSync(file, "utf8")
    .split(/--> statement-breakpoint/)
    .map((s) => s.trim().replace(/;+$/, ""))
    .filter((s) => s && !s.trim().startsWith("--"));
}

async function migrate() {
  const db = getDb();
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "drizzle"`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "drizzle"."__migration" ("id" text PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())`));
  const raw = (await db.execute(sql.raw(`SELECT id FROM drizzle."__migration"`))) as unknown;
  // PGlite returns { rows }, postgres-js returns an array - normalise both.
  const appliedRows = (Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] })?.rows ?? [])) as Array<{ id: string }>;
  const applied = new Set(appliedRows.map((r) => r.id));

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let n = 0;
  for (const f of files) {
    if (applied.has(f)) continue;
    for (const st of statements(path.join(MIGRATIONS, f))) {
      try {
        await db.execute(sql.raw(st));
      } catch (e) {
        console.error(`\nfailed statement in ${f}:\n${st.slice(0, 220)}\n`);
        throw e;
      }
    }
    await db.execute(sql.raw(`INSERT INTO drizzle."__migration" (id) VALUES ('${f}') ON CONFLICT DO NOTHING`));
    console.log(`  applied ${f}`);
    n++;
  }
  console.log(n ? `migrated ${n} file(s)` : "already up to date");
}

async function main() {
  const cmd = process.argv[2] ?? "help";

  if (cmd === "reset") {
    if (!isPglite()) {
      console.log("refusing to reset a remote DATABASE_URL - drop the schema manually if you mean it");
      process.exit(1);
    }
    await closeDb();
    rmSync(path.join(process.cwd(), ".data", "pgdata"), { recursive: true, force: true });
    console.log("local database cleared");
    await migrate();
    await closeDb();
    return;
  }

  if (cmd === "migrate") { await migrate(); await closeDb(); return; }

  if (cmd === "seed") {
    await migrate();
    const { seed } = await import("../src/db/seed");
    await seed(getDb() as never);
    await closeDb();
    return;
  }

  if (cmd === "jobs") {
    const { runDueJobs } = await import("../src/core/jobs");
    console.log(await runDueJobs());
    await closeDb();
    return;
  }

  if (cmd === "verify") {
    const { verify } = await import("../tests/verify");
    process.exit(await verify());
  }

  console.log("usage: tsx scripts/db.ts migrate|seed|reset|jobs|verify");
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
