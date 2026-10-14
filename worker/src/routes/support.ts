import { Hono } from 'hono';
import type { Env } from '../config';
import { badRequest, notFound, validationError } from '../lib/errors';
import { getSession, requireUser, requireAdmin } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { reqInt, reqStr } from '../lib/validate';
import { notify } from '../lib/notify';
import { logError } from '../lib/errorlog';
import { nowIso } from '../lib/util';
import { clientIp } from '../lib/ip';

/**
 * Support tickets: contact becomes a tracked, answerable thread.
 * Public create (guests welcome), account thread view, admin queue.
 */
export const supportPublic = new Hono<{ Bindings: Env }>();
export const supportAccount = new Hono<{ Bindings: Env }>();
export const supportAdmin = new Hono<{ Bindings: Env }>();

supportPublic.post('/support', async (c) => {
  const env = c.env;
  await rateLimit(env, 'support', clientIp(c), 5, 3600);
  const body = (await c.req.json().catch(() => null)) as { email?: unknown; name?: unknown; subject?: unknown; message?: unknown } | null;
  if (!body) throw badRequest('Invalid request.');
  const email = reqStr(body.email, { min: 5, max: 160 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw validationError('Enter a valid email.');
  const subject = reqStr(body.subject, { min: 3, max: 140 });
  const message = reqStr(body.message, { min: 10, max: 4000 });
  const name = typeof body.name === 'string' ? body.name.slice(0, 80) : null;
  const user = await getSession(env, c);
  const res = await env.DB.prepare('INSERT INTO support_tickets (user_id, email, name, subject) VALUES (?, ?, ?, ?)').bind(user?.id ?? null, email, name, subject).run();
  const ticketId = Number(res.meta.last_row_id);
  await env.DB.prepare('INSERT INTO support_messages (ticket_id, author, body) VALUES (?, ?, ?)').bind(ticketId, 'user', message).run();
  const admins = (await env.DB.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all()).results as { id: number }[];
  for (const a of admins) {
    await notify(env, { userId: a.id, type: 'support.new', title: 'New support ticket', body: subject, data: { ticket_id: ticketId } }).catch(() => undefined);
  }
  return c.json({ ok: true, ticket_id: ticketId, message: 'Thanks — a person will reply. Keep your ticket number.' });
});

async function threadFor(env: Env, ticketId: number) {
  const ticket = (await env.DB.prepare('SELECT * FROM support_tickets WHERE id = ?').bind(ticketId).first()) as Record<string, unknown> | null;
  if (!ticket) throw notFound('Ticket not found.');
  const messages = (await env.DB.prepare('SELECT author, body, created_at FROM support_messages WHERE ticket_id = ? ORDER BY id ASC').bind(ticketId).all()).results;
  return { ticket, messages };
}

supportAccount.get('/support', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare('SELECT id, subject, status, created_at, updated_at FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50').bind(user.id).all()).results;
  return c.json({ ok: true, tickets: rows });
});

supportAccount.get('/support/:id', async (c) => {
  const user = await requireUser(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const { ticket, messages } = await threadFor(c.env, id);
  if (ticket.user_id !== user.id) throw notFound('Ticket not found.');
  return c.json({ ok: true, ticket, messages });
});

supportAccount.post('/support/:id', async (c) => {
  const user = await requireUser(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const { ticket } = await threadFor(c.env, id);
  if (ticket.user_id !== user.id) throw notFound('Ticket not found.');
  if (ticket.status === 'closed') throw badRequest('This ticket is closed — open a new one from the contact page.');
  const body = (await c.req.json().catch(() => null)) as { message?: unknown } | null;
  const message = reqStr(body?.message, { min: 1, max: 4000 });
  await c.env.DB.prepare('INSERT INTO support_messages (ticket_id, author, body) VALUES (?, ?, ?)').bind(id, 'user', message).run();
  await c.env.DB.prepare("UPDATE support_tickets SET status = 'open', updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
  return c.json({ ok: true });
});

supportAdmin.get('/support', async (c) => {
  await requireAdmin(c.env, c);
  const status = c.req.query('status') || 'open';
  const rows = (await c.env.DB.prepare(
    `SELECT t.*, (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS messages
     FROM support_tickets t WHERE (? = 'all' OR t.status = ?) ORDER BY t.updated_at ASC LIMIT 100`,
  ).bind(status, status).all()).results;
  return c.json({ ok: true, tickets: rows });
});

supportAdmin.get('/support/:id', async (c) => {
  await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const { ticket, messages } = await threadFor(c.env, id);
  return c.json({ ok: true, ticket, messages });
});

supportAdmin.post('/support/:id/reply', async (c) => {
  await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const { ticket } = await threadFor(c.env, id);
  const body = (await c.req.json().catch(() => null)) as { message?: unknown; close?: unknown } | null;
  const message = reqStr(body?.message, { min: 1, max: 4000 });
  await c.env.DB.prepare('INSERT INTO support_messages (ticket_id, author, body) VALUES (?, ?, ?)').bind(id, 'admin', message).run();
  await c.env.DB.prepare('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?').bind(body?.close === true ? 'closed' : 'answered', nowIso(), id).run();
  if (ticket.user_id) {
    await notify(c.env, { userId: ticket.user_id as number, type: 'support.reply', title: 'Support replied to your ticket', body: String(ticket.subject), data: { ticket_id: id } }).catch(() => undefined);
  }
  return c.json({ ok: true });
});

/** Browser error beacon: feeds the same error_log admins already watch. */
supportPublic.post('/client-error', async (c) => {
  const env = c.env;
  await rateLimit(env, 'client-error', clientIp(c), 20, 3600).catch(() => undefined);
  const body = (await c.req.json().catch(() => null)) as { message?: unknown; route?: unknown; digest?: unknown } | null;
  await logError(env, {
    scope: 'web',
    route: typeof body?.route === 'string' ? body.route : null,
    status: 0,
    code: typeof body?.digest === 'string' ? body.digest : 'client',
    message: typeof body?.message === 'string' ? body.message.slice(0, 500) : 'Browser error',
  });
  return c.json({ ok: true });
});
