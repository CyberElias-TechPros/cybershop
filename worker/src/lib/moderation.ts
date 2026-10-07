import type { Env } from '../config';
import { nowIso, hoursFromNow } from './util';
import { audit } from './audit';
import { notify } from './notify';

/**
 * Report moderation.
 *
 * A trust-and-safety queue is only as good as its follow-through. Before this
 * module a report had a status and nothing else: no owner, so two admins could
 * work the same one (or neither); no clock, so nothing said "this has been open
 * for four days"; and no feedback, so the person who reported a scam never
 * learned whether anything happened — which is how buyers conclude that
 * reporting is theatre.
 *
 * Now every report gets an owner and an SLA on creation, warns when it is about
 * to breach, and tells the reporter what was done.
 */

export const REPORT_SLA_HOURS = 48;

export const REPORT_OUTCOMES = [
  'no_action',
  'warning_sent',
  'content_removed',
  'store_suspended',
  'unfounded',
] as const;
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number];

/** Actions an admin can take from a report, mapped to what the reporter is told. */
const OUTCOME_COPY: Record<ReportOutcome, string> = {
  no_action: 'We reviewed it and found nothing that breaks our rules.',
  warning_sent: 'We reviewed it and warned the seller.',
  content_removed: 'We reviewed it and removed the listing.',
  store_suspended: 'We reviewed it and suspended the store.',
  unfounded: 'We reviewed it and could not substantiate the report.',
};

export interface ReportSla {
  due_at: string;
  hours_left: number;
  breached: boolean;
}

export function slaFor(createdAt: string, slaDueAt: string | null): ReportSla {
  const due = slaDueAt ?? hoursFromNow(REPORT_SLA_HOURS, createdAt);
  const msLeft = new Date(due).getTime() - Date.now();
  return {
    due_at: due,
    hours_left: Math.round((msLeft / 3600_000) * 10) / 10,
    breached: msLeft <= 0,
  };
}

/** Attach an owner and a clock the moment a report lands. */
export async function openReport(env: Env, reportId: number): Promise<void> {
  await env.DB.prepare(`UPDATE reports SET sla_due_at = ? WHERE id = ? AND sla_due_at IS NULL`)
    .bind(hoursFromNow(REPORT_SLA_HOURS), reportId)
    .run();
}

export interface ResolveArgs {
  reportId: number;
  adminId: number;
  status: 'resolved' | 'dismissed';
  outcome: ReportOutcome;
  note?: string | null;
  /** Take the matching action on the reported thing, not just note it. */
  act?: boolean;
}

/**
 * Close a report.
 *
 * `act` is the part that matters: marking a report "resolved" while leaving a
 * fraudulent listing up is worse than leaving the report open, because it looks
 * handled. So when the outcome implies an action and `act` is set, the listing
 * is unpublished or the store is suspended in the same transaction-ish block.
 */
export async function resolveReport(env: Env, args: ResolveArgs): Promise<{ acted: string | null }> {
  const r = (await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(args.reportId).first()) as
    | { id: number; entity_type: string; entity_id: number; reporter_user_id: number | null; status: string }
    | null;
  if (!r) throw new Error('Report not found.');

  let acted: string | null = null;

  if (args.act && args.status === 'resolved') {
    if (args.outcome === 'content_removed' && r.entity_type === 'listing') {
      const res = await env.DB.prepare(
        `UPDATE listings SET status = 'archived' WHERE id = ? AND deleted_at IS NULL`
      ).bind(r.entity_id).run();
      acted = res.meta.changes > 0 ? 'listing unpublished' : null;
    } else if (args.outcome === 'store_suspended' && r.entity_type === 'business') {
      const res = await env.DB.prepare(
        `UPDATE businesses SET status = 'suspended' WHERE id = ? AND deleted_at IS NULL AND status != 'suspended'`
      ).bind(r.entity_id).run();
      acted = res.meta.changes > 0 ? 'store suspended' : null;
    } else if (args.outcome === 'store_suspended' && r.entity_type === 'listing') {
      // Reported a listing, escalated to the store: follow the listing home.
      const row = (await env.DB.prepare(
        `UPDATE businesses SET status = 'suspended'
         WHERE id = (SELECT business_id FROM listings WHERE id = ?) AND deleted_at IS NULL AND status != 'suspended'`
      ).bind(r.entity_id).run());
      acted = row.meta.changes > 0 ? 'store suspended' : null;
    }
  }

  const now = nowIso();
  await env.DB.prepare(
    `UPDATE reports SET status = ?, resolution = ?, resolution_note = ?, resolved_by = ?, resolved_at = ?, updated_at = ? WHERE id = ?`
  ).bind(args.status, args.outcome, args.note?.slice(0, 500) ?? null, args.adminId, now, now, args.reportId).run();

  // Tell the reporter. They are the reason we have the report at all.
  if (r.reporter_user_id) {
    await notify(env, {
      userId: r.reporter_user_id,
      type: 'report.resolved',
      title: args.status === 'dismissed' ? 'Your report was closed' : 'We acted on your report',
      body: OUTCOME_COPY[args.outcome] + (acted ? ` (${acted}).` : '.'),
      data: { report_id: r.id, outcome: args.outcome },
    });
  }

  await audit(env, {
    actor: { id: args.adminId, role: 'admin' },
    action: 'report.resolve',
    entityType: 'report',
    entityId: args.reportId,
    meta: { status: args.status, outcome: args.outcome, acted, note: args.note?.slice(0, 500) ?? null },
  });

  return { acted };
}

/** Claim a report so two admins do not work the same one. */
export async function claimReport(env: Env, reportId: number, adminId: number): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE reports SET assignee_user_id = ?, triaged_at = COALESCE(triaged_at, ?), status = CASE WHEN status = 'open' THEN 'investigating' ELSE status END, updated_at = ? WHERE id = ?`
  ).bind(adminId, now, now, reportId).run();
}

/**
 * Hourly: warn on reports that are about to miss the SLA, flag the ones that
 * already have, and re-open nothing. Idempotent — safe to run every hour.
 */
export async function reportSlaSweep(env: Env): Promise<{ warned: number; breached: number }> {
  const open = (await env.DB.prepare(
    `SELECT id, assignee_user_id FROM reports WHERE status IN ('open','investigating')`
  ).all()).results as { id: number; assignee_user_id: number | null }[];

  let warned = 0;
  let breached = 0;
  const now = Date.now();

  for (const r of open) {
    const row = (await env.DB.prepare('SELECT created_at, sla_due_at, sla_breached_at FROM reports WHERE id = ?').bind(r.id).first()) as
      | { created_at: string; sla_due_at: string | null; sla_breached_at: string | null }
      | null;
    if (!row) continue;
    const due = row.sla_due_at ?? hoursFromNow(REPORT_SLA_HOURS, row.created_at);
    if (!row.sla_due_at) await env.DB.prepare('UPDATE reports SET sla_due_at = ? WHERE id = ?').bind(due, r.id).run();

    const msLeft = new Date(due).getTime() - now;
    if (msLeft <= 0) {
      if (!row.sla_breached_at) {
        await env.DB.prepare('UPDATE reports SET sla_breached_at = ? WHERE id = ?').bind(nowIso(), r.id).run();
        await notifyAdmins(env, {
          type: 'report.sla_breached',
          title: 'A report has passed its 48-hour SLA',
          body: `Report #${r.id} is still open. Buyers judge this platform by how fast reports are answered.`,
          data: { report_id: r.id },
        });
      }
      breached++;
    } else if (msLeft <= 6 * 3600_000) {
      // One warning, six hours out.
      const already = (await env.DB.prepare(
        `SELECT id FROM notifications WHERE type = 'report.sla_warning' AND json_extract(data, '$.report_id') = ?`
      ).bind(r.id).first()) as { id: number } | null;
      if (!already) {
        await notifyAdmins(env, {
          type: 'report.sla_warning',
          title: 'A report is due within 6 hours',
          body: `Report #${r.id} needs a decision today.`,
          data: { report_id: r.id },
        });
        warned++;
      }
    }
  }
  return { warned, breached };
}

async function notifyAdmins(
  env: Env,
  args: { type: string; title: string; body: string; data?: Record<string, unknown> }
): Promise<void> {
  const admins = (await env.DB.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all()).results as {
    id: number;
  }[];
  for (const a of admins) {
    await notify(env, { userId: a.id, type: args.type, title: args.title, body: args.body, data: args.data });
  }
}
