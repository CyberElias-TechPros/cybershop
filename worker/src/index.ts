import { buildApp } from './app';
import type { Env } from './config';
import { runHourlyJobs } from './jobs/cron';
import { flushPaymentActivations, flushPaymentSettlements } from './lib/payments';
import { dispatchMail } from './lib/outbox';
import { checkEnv } from './lib/envcheck';

const app = buildApp();

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  // A configured cron alone is insufficient: Cloudflare requires this handler.
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const started = Date.now();
    const report = checkEnv(env);
    if (!report.ok) throw new Error('Scheduled maintenance refused unsafe configuration');
    console.log('[cron] started');
    try {
      if (_controller.cron === '*/2 * * * *') {
        const result = await dispatchMail(env);
        await flushPaymentActivations(env);
        await flushPaymentSettlements(env);
        console.log('[mail] dispatch_completed', result);
        return;
      }
      const result = await runHourlyJobs(env);
      console.log('[cron] completed', { durationMs: Date.now() - started, summary: result.summary });
    } catch {
      console.error('[cron] failed', { durationMs: Date.now() - started });
      // Reject to expose failure to Cloudflare metrics; no raw data/secrets in logs.
      throw new Error('Scheduled maintenance failed');
    }
  },
};
