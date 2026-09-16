import { Hono } from 'hono';
import QRCode from 'qrcode';
import type { Env } from '../config';
import { badRequest } from '../lib/errors';
import { rateLimit } from '../lib/ratelimit';
import { clientIp } from '../lib/ip';

/**
 * Self-hosted QR codes (storefront flyers, table tents, shop windows).
 * GET /api/qr.svg?d=<url-or-path>  →  image/svg+xml
 * Public (browsers embed it directly in <img>), rate-limited per IP,
 * cacheable forever (the data is in the URL).
 */
const app = new Hono<{ Bindings: Env }>();

app.get('/qr.svg', async (c) => {
  await rateLimit(c.env, 'qr', clientIp(c), 120, 300);
  const raw = c.req.query('d') || '';
  if (!raw || raw.length > 512) throw badRequest('Missing or oversized QR payload.');
  // absolute https URLs or site-relative paths only — no javascript:/data: tricks
  if (!/^https:\/\/[a-z0-9.-]+[/:]/i.test(raw) && !/^\//.test(raw)) {
    throw badRequest('QR payload must be an https URL or a site path.');
  }
  const svg = await QRCode.toString(raw, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#060b09', light: '#ffffff' },
  });
  return c.body(svg, 200, {
    'content-type': 'image/svg+xml',
    'cache-control': 'public, max-age=31536000, immutable',
  });
});

export default app;
