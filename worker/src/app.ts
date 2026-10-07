import { Hono } from 'hono';
import type { Env } from './config';
import { AppError, errorMessage } from './lib/errors';
import { ensureAdmin } from './boot';
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import publicPremiumRoutes from './routes/public-premium';
import vendorRoutes from './routes/vendor';
import vendorPremiumRoutes from './routes/vendor-premium';
import adminRoutes from './routes/admin';
import adminPremiumRoutes from './routes/admin-premium';
import adminOpsRoutes from './routes/admin-ops';
import accountRoutes from './routes/account';
import vendorOpsRoutes from './routes/vendor-ops';
import webhookRoutes from './routes/webhook';
import mediaFileRoutes from './routes/mediafile';
import sitemapRoutes from './routes/sitemap';
import qrRoutes from './routes/qr';
import { runHourlyJobs } from './jobs/cron';
import { reportEnv } from './lib/envcheck';

/**
 * Routes open to the browser or external services (no internal secret required):
 *  - /api/media/file/:id  (public D1 media + admin-gated private files)
 *  - /api/sitemap.xml
 *  - /api/webhooks/*      (Paystack — server-to-server, signature-verified)
 *  - /healthz
 * Everything else under /api/* is called by the Vercel proxy with x-internal-secret.
 */
const PUBLIC_PREFIXES = ['/api/media/file/', '/api/sitemap.xml', '/api/webhooks/', '/api/qr.svg', '/healthz'];

export function buildApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.use('/api/*', async (c, next) => {
    const path = c.req.path;
    if (!PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
      const secret = c.req.header('x-internal-secret');
      if (!secret || secret !== c.env.INTERNAL_SECRET) {
        throw new AppError(403, 'forbidden', 'Forbidden.');
      }
    }
    await next();
  });

  // first-boot admin (idempotent, cheap)
  app.use('*', async (c, next) => {
    await ensureAdmin(c.env);
    await next();
  });

  app.get('/healthz', (c) => {
    const r = reportEnv(c.env);
    return c.json({
      ok: true,
      service: 'cybershop-api',
      time: new Date().toISOString(),
      // Coarse on purpose: which settings are wrong, never their values. Lets a
      // deploy check confirm the keys landed without leaking them to the world.
      config: { ok: r.ok, production: r.production, missing: r.missing, unsafe: r.unsafe, warnings: r.warnings },
    });
  });

  app.route('/api/auth', authRoutes);
  app.route('/api/account', accountRoutes);
  app.route('/api/public', publicRoutes);
  app.route('/api/public', publicPremiumRoutes);
  app.route('/api/vendor', vendorRoutes);
  app.route('/api/vendor', vendorPremiumRoutes);
  app.route('/api/vendor', vendorOpsRoutes);
  app.route('/api/admin', adminRoutes);
  app.route('/api/admin', adminPremiumRoutes);
  app.route('/api/admin', adminOpsRoutes);
  app.route('/api/webhooks', webhookRoutes);
  app.route('/api/media', mediaFileRoutes);
  app.route('/api', qrRoutes);
  app.route('/api/sitemap.xml', sitemapRoutes);

  // cron trigger entrypoint (wrangler.jsonc crons)
  app.post('/api/cron/hourly', async (c) => {
    const secret = c.req.header('x-internal-secret');
    if (!secret || secret !== c.env.INTERNAL_SECRET) throw new AppError(403, 'forbidden', 'Forbidden.');
    const { summary } = await runHourlyJobs(c.env);
    return c.json({ ok: true, summary });
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ ok: false, error: { code: err.code, message: err.message, details: err.details } }, err.status as 200);
    }
    console.error('[api error]', err);
    return c.json({ ok: false, error: { code: 'internal_error', message: errorMessage(err) } }, 500);
  });

  app.notFound((c) => c.json({ ok: false, error: { code: 'not_found', message: 'Route not found.' } }, 404));

  return app;
}
