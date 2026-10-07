import type { Env } from '../config';
import { nowIso } from './util';

/**
 * Notification preferences.
 *
 * Vendors do not want "all notifications" or "no notifications". They want the
 * lead email and not the marketing one. Give them a binary switch and they
 * mute everything, and then they churn — so this is per category, per channel.
 *
 * In-app is the record of what happened and cannot be turned off (it is also
 * what the bell badge counts). Email is the channel people mute, so it is the
 * one with a switch. Anything not listed falls through to its default.
 */

export interface Category {
  key: string;
  label: string;
  help: string;
  /** Email on by default? Money, access and leads — everything else is opt-in. */
  defaultEmail: boolean;
  /** Which `notifications.type` values belong to this category. */
  types: string[];
}

export const CATEGORIES: Category[] = [
  {
    key: 'leads',
    label: 'New leads and enquiries',
    help: 'A buyer clicked through to WhatsApp, or sent a message. This is the income — leave it on.',
    defaultEmail: true,
    types: ['inquiry.new', 'thread.new', 'thread.message', 'follow_up.due'],
  },
  {
    key: 'money',
    label: 'Payments, plan and deposits',
    help: 'Approvals, rejections, refunds, renewals and deposit events.',
    defaultEmail: true,
    types: [
      'payment.approved', 'payment.rejected', 'payment.refunded', 'payment.submitted',
      'subscription.extended', 'subscription.expiring', 'subscription.expired',
      'deposit.paid', 'deposit.released', 'deposit.refunded', 'deposit.refund_requested',
    ],
  },
  {
    key: 'account',
    label: 'Account and store status',
    help: 'Your store going live, being suspended, or verified ID being reviewed.',
    defaultEmail: true,
    types: ['business.active', 'business.suspended', 'business.featured', 'verification.approved', 'verification.rejected', 'staff.joined'],
  },
  {
    key: 'reviews',
    label: 'Reviews',
    help: 'A buyer left a review on one of your listings.',
    defaultEmail: false,
    types: ['review.new'],
  },
  {
    key: 'reports',
    label: 'Reports and moderation',
    help: 'A report you filed was decided, or one was filed against your store.',
    defaultEmail: false,
    types: ['report.resolved', 'report.new'],
  },
  {
    key: 'saved_searches',
    label: 'Saved search alerts',
    help: 'New listings matching a search you saved.',
    defaultEmail: false,
    types: ['saved_search.match'],
  },
  {
    key: 'security',
    label: 'Security',
    help: 'Two-factor turned on or off on your account. Never switch this off.',
    defaultEmail: true,
    types: ['security.2fa_enabled', 'security.2fa_disabled', 'health.alert'],
  },
];

/** Which category a `notifications.type` belongs to, or null if uncategorised. */
const TYPE_TO_CATEGORY = new Map<string, string>();
for (const c of CATEGORIES) for (const t of c.types) TYPE_TO_CATEGORY.set(t, c.key);

export function categoryForType(type: string): string | null {
  return TYPE_TO_CATEGORY.get(type) ?? null;
}

export interface PrefRow {
  category: string;
  in_app: number;
  email: number;
}

export interface ResolvedPrefs {
  categories: { key: string; label: string; help: string; in_app: boolean; email: boolean; default_email: boolean }[];
  /** Category key → may this type be emailed to this user? */
  emailAllowed: Record<string, boolean>;
}

const defaultsFor = (key: string) => ({
  in_app: true,
  email: CATEGORIES.find((c) => c.key === key)?.defaultEmail ?? false,
});

/** Read a user's preferences, with every known category present. */
export async function getPrefs(env: Env, userId: number): Promise<ResolvedPrefs> {
  const rows = (await env.DB.prepare(
    'SELECT category, in_app, email FROM notification_prefs WHERE user_id = ?'
  ).bind(userId).all()).results as unknown as PrefRow[];
  const stored = new Map(rows.map((r) => [r.category, r]));

  const categories = CATEGORIES.map((c) => {
    const d = defaultsFor(c.key);
    const row = stored.get(c.key);
    return {
      key: c.key,
      label: c.label,
      help: c.help,
      // In-app is never switchable: the bell is the record of what happened.
      in_app: true,
      email: row ? row.email === 1 : d.email,
      default_email: d.email,
    };
  });

  const emailAllowed: Record<string, boolean> = {};
  for (const c of categories) emailAllowed[c.key] = c.email;
  // An uncategorised type keeps the old behaviour (email if it was mirrored).
  emailAllowed._other = true;

  return { categories, emailAllowed };
}

export async function setPrefs(
  env: Env,
  userId: number,
  updates: { category: string; email?: boolean; in_app?: boolean }[]
): Promise<void> {
  for (const u of updates) {
    if (!CATEGORIES.some((c) => c.key === u.category)) continue;
    const current = (await env.DB.prepare(
      'SELECT in_app, email FROM notification_prefs WHERE user_id = ? AND category = ?'
    ).bind(userId, u.category).first()) as PrefRow | null;
    const d = defaultsFor(u.category);
    const inApp = u.in_app ?? (current ? current.in_app === 1 : d.in_app);
    const email = u.email ?? (current ? current.email === 1 : d.email);
    await env.DB.prepare(
      `INSERT INTO notification_prefs (user_id, category, in_app, email, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, category) DO UPDATE SET in_app = excluded.in_app, email = excluded.email, updated_at = excluded.updated_at`
    ).bind(userId, u.category, inApp ? 1 : 0, email ? 1 : 0, nowIso()).run();
  }
}

/**
 * Should this notification be emailed to this user?
 *
 * One indexed primary-key lookup per notify(). Deliberately uncached: a vendor
 * who switches a category off expects that to apply to the *next* lead, not to
 * whenever the isolate happens to be recycled, and notify() is called a handful
 * of times per request at most.
 */
export async function emailAllowed(env: Env, userId: number, type: string): Promise<boolean> {
  const key = categoryForType(type);
  if (!key) return true; // uncategorised → keep the previous behaviour
  const row = (await env.DB.prepare(
    'SELECT email FROM notification_prefs WHERE user_id = ? AND category = ?'
  ).bind(userId, key).first()) as { email: number } | null;
  return row ? row.email === 1 : defaultsFor(key).email;
}
