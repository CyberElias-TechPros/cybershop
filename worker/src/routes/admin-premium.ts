import { Hono } from 'hono';
import type { Env } from '../config';
import { requireAdmin } from '../lib/auth';
import { badRequest, notFound } from '../lib/errors';
import { nowIso } from '../lib/util';
import { optStr, reqInt } from '../lib/validate';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { mediaUrl, getMedia } from '../lib/media';
import { clientIp } from '../lib/ip';

const app = new Hono<{ Bindings: Env }>();

app.get('/verifications', async (c) => {
  await requireAdmin(c.env, c);
  const status = c.req.query('status') || 'pending';
  const rows = (await c.env.DB.prepare(
    `SELECT v.*, b.name AS business_name, b.slug AS business_slug, b.verification_status
     FROM verification_requests v JOIN businesses b ON b.id = v.business_id
     WHERE (? = 'all' OR v.status = ?)
     ORDER BY v.id DESC LIMIT 80`
  ).bind(status, status).all()).results as Record<string, unknown>[];
  const out = [];
  for (const r of rows) {
    let image: { url: string } | null = null;
    if (r.media_id) {
      const m = await getMedia(c.env, Number(r.media_id));
      if (m) image = { url: mediaUrl(c.env, m) };
    }
    out.push({ ...r, image });
  }
  return c.json({ ok: true, requests: out });
});

app.post('/verifications/:id/approve', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const row = (await c.env.DB.prepare('SELECT * FROM verification_requests WHERE id = ?').bind(id).first()) as { id: number; business_id: number; status: string } | null;
  if (!row) throw notFound('Request not found.');
  if (row.status !== 'pending') throw badRequest(`Already ${row.status}.`);
  await c.env.DB.prepare(
    `UPDATE verification_requests SET status = 'approved', reviewed_at = ?, reviewed_by = ? WHERE id = ?`
  ).bind(nowIso(), admin.id, id).run();
  await c.env.DB.prepare(`UPDATE businesses SET verification_status = 'verified' WHERE id = ?`).bind(row.business_id).run();
  const owner = (await c.env.DB.prepare('SELECT owner_user_id, name FROM businesses WHERE id = ?').bind(row.business_id).first()) as { owner_user_id: number; name: string } | null;
  if (owner) {
    await notify(c.env, { userId: owner.owner_user_id, type: 'verification.approved', title: 'Your ID is verified', body: `“${owner.name}” now shows a Verified ID badge.` });
  }
  await audit(c.env, { actor: admin, action: 'verification.approve', entityType: 'verification', entityId: id, ip: clientIp(c) === 'unknown' ? null : clientIp(c) });
  return c.json({ ok: true });
});

app.post('/verifications/:id/reject', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const note = optStr(body?.note, 500) || 'ID could not be verified.';
  const row = (await c.env.DB.prepare('SELECT * FROM verification_requests WHERE id = ?').bind(id).first()) as { id: number; business_id: number; status: string } | null;
  if (!row) throw notFound('Request not found.');
  if (row.status !== 'pending') throw badRequest(`Already ${row.status}.`);
  await c.env.DB.prepare(
    `UPDATE verification_requests SET status = 'rejected', review_note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?`
  ).bind(note, nowIso(), admin.id, id).run();
  await c.env.DB.prepare(`UPDATE businesses SET verification_status = 'rejected' WHERE id = ?`).bind(row.business_id).run();
  const owner = (await c.env.DB.prepare('SELECT owner_user_id FROM businesses WHERE id = ?').bind(row.business_id).first()) as { owner_user_id: number } | null;
  if (owner) {
    await notify(c.env, { userId: owner.owner_user_id, type: 'verification.rejected', title: 'ID verification was not approved', body: note });
  }
  await audit(c.env, { actor: admin, action: 'verification.reject', entityType: 'verification', entityId: id, ip: clientIp(c) === 'unknown' ? null : clientIp(c), meta: { note } });
  return c.json({ ok: true });
});

export default app;
