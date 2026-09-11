import { defineConfig } from "drizzle-kit";

/** Migrations are committed SQL (constitution rule 5). PGlite and Neon run the same files. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: false,
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://local:local@localhost:5432/cybershop" },
});
