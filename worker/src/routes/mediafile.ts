import { Hono } from 'hono';
import type { Env } from '../config';
import { notFound, forbidden } from '../lib/errors';
import { getMedia, blobToBuffer } from '../lib/media';
import { requireUser } from '../lib/auth';
import { reqInt } from '../lib/validate';

const app = new Hono<{ Bindings: Env }>();

/**
 * Stream a D1-stored media row (dev-mode public media + private files such as
 * payment proofs). Public rows are open; private rows require an admin session.
 * In production, public vendor media is served directly from the media gateway
 * (plain HTTPS URL) — this route is not on that hot path.
 */
app.get('/file/:id', async (c) => {
  const env = c.env;
  const id = reqInt(c.req.param('id'), { min: 1 });
  const row = await getMedia(env, id);
  if (!row || !row.d1_blob) throw notFound('Media not found.');
  if (row.visibility === 'private') {
    const user = await requireUser(env, c);
    if (user.role !== 'admin') throw forbidden('Private media requires admin access.');
  }
  const bytes = blobToBuffer(row.d1_blob);
  const disposition = row.visibility === 'private' ? `attachment; filename="${row.storage_key.split('/').pop()}"` : 'inline';
  return new Response(bytes, {
    headers: {
      'Content-Type': row.mime_type,
      'Content-Disposition': disposition,
      'Content-Length': String((bytes as ArrayBuffer).byteLength),
      'Cache-Control': row.visibility === 'private' ? 'no-store' : 'public, max-age=31536000, immutable',
    },
  });
});

export default app;
