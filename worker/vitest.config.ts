import { defineConfig } from 'vitest/config';

// Unit tests run on the node pool. Integration (flows) tests run against a
// live `wrangler dev` worker on 127.0.0.1:8787 (started by the test harness
// if not already running) — this exercises the real runtime, D1 and migrations.
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
    // Each integration suite owns its port/config/D1 state. Keep execution
    // serial to cap workerd memory/CPU on modest CI runners.
    fileParallelism: false,
  },
});
