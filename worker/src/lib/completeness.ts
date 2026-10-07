import type { Env } from './../config';

/**
 * Store strength.
 *
 * A marketplace only has two levers: more stores, and stores that convert
 * better. This is the second one. Every item below is something a buyer
 * actually looks for before tapping the WhatsApp button, so the score is not
 * decoration — it is the vendor's to-do list, ordered by what moves enquiries.
 *
 * Read-only and cheap (a handful of indexed counts), so it can run on every
 * dashboard load.
 */

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** Where the vendor fixes it. Kept as a path so the link is ours, not theirs. */
  href: string;
  /** Weight in the score — a photo is worth more than a social link. */
  weight: number;
}

export interface Completeness {
  pct: number;
  done: ChecklistItem[];
  missing: ChecklistItem[];
  /** The single next thing to do, highest weight first. */
  next: ChecklistItem | null;
  level: 'empty' | 'starter' | 'good' | 'strong';
}

const MIN_ABOUT = 80;

export async function storeCompleteness(env: Env, businessId: number): Promise<Completeness> {
  const b = (await env.DB.prepare(
    `SELECT name, about, description, logo_media_id, cover_media_id, phone, address, city, state_region,
            website, social, verification_status, settings
     FROM businesses WHERE id = ?`
  ).bind(businessId).first()) as
    | {
        name: string;
        about: string | null;
        description: string | null;
        logo_media_id: number | null;
        cover_media_id: number | null;
        phone: string | null;
        address: string | null;
        city: string | null;
        state_region: string | null;
        website: string | null;
        social: string | null;
        verification_status: string | null;
        settings: string | null;
      }
    | null;
  if (!b) return { pct: 0, done: [], missing: [], next: null, level: 'empty' };

  // Five small indexed counts. Read together on a dashboard load this is well
  // under a millisecond each in D1, and far easier to reason about than a batch.
  const one = async (sql: string): Promise<number> => {
    const row = (await env.DB.prepare(sql).bind(businessId).first()) as { n: number } | null;
    return Number(row?.n ?? 0);
  };
  const c = {
    published: await one(`SELECT COUNT(*) AS n FROM listings WHERE business_id = ? AND status = 'published' AND deleted_at IS NULL`),
    with_photo: await one(
      `SELECT COUNT(*) AS n FROM listings l WHERE l.business_id = ? AND l.status = 'published' AND l.deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM item_media im WHERE im.listing_id = l.id)`
    ),
    categories: await one(`SELECT COUNT(*) AS n FROM business_categories WHERE business_id = ?`),
    wa: await one(`SELECT COUNT(*) AS n FROM whatsapp_numbers WHERE business_id = ? AND status = 'active' AND deleted_at IS NULL`),
    offers: await one(`SELECT COUNT(*) AS n FROM offers WHERE business_id = ? AND is_active = 1`),
  };

  let socialCount = 0;
  try {
    const s = JSON.parse(b.social || '{}') as Record<string, unknown>;
    socialCount = Object.values(s).filter((v) => typeof v === 'string' && v.trim().length > 3).length;
  } catch {
    socialCount = 0;
  }

  let hours = false;
  try {
    const st = JSON.parse(b.settings || '{}') as { hours?: unknown };
    hours = typeof st.hours === 'string' && st.hours.trim().length > 3;
  } catch {
    hours = false;
  }

  const about = (b.about || b.description || '').trim();

  const items: ChecklistItem[] = [];
  const add = (key: string, label: string, href: string, weight: number, done: boolean) =>
    items.push({ key, label, href, weight, done });

  add('logo', 'Add your store photo', '/dashboard/settings', 14, !!b.logo_media_id);
  add('cover', 'Add a cover photo', '/dashboard/settings', 6, !!b.cover_media_id);
  add('about', 'Write an About description (a paragraph, not a line)', '/dashboard/settings', 12, about.length >= MIN_ABOUT);
  add('whatsapp', 'Add your WhatsApp number', '/dashboard/whatsapp', 16, (c.wa ?? 0) > 0);
  add('listings', 'Publish your first 3 items', '/dashboard/catalog/new', 14, (c.published ?? 0) >= 3);
  add('photos', 'Put a photo on every item', '/dashboard/catalog', 12, (c.published ?? 0) > 0 && (c.with_photo ?? 0) >= (c.published ?? 0));
  add('location', 'Add your address and city', '/dashboard/settings', 8, !!(b.address && b.city));
  add('hours', 'Add your opening hours', '/dashboard/settings', 5, hours);
  add('categories', 'Pick the categories you trade in', '/dashboard/settings', 5, (c.categories ?? 0) > 0);
  add('social', 'Link one social account', '/dashboard/settings', 4, socialCount > 0);
  add('offers', 'Run an offer or a discount', '/dashboard/offers', 4, (c.offers ?? 0) > 0);
  add('verified', 'Get your ID verified', '/dashboard/verification', 8, b.verification_status === 'verified');

  const total = items.reduce((n, i) => n + i.weight, 0);
  const scored = items.reduce((n, i) => n + (i.done ? i.weight : 0), 0);
  const pct = total === 0 ? 0 : Math.round((scored / total) * 100);

  const done = items.filter((i) => i.done);
  const missing = items.filter((i) => !i.done).sort((a, x) => x.weight - a.weight);

  return {
    pct,
    done,
    missing,
    next: missing[0] ?? null,
    level: pct >= 90 ? 'strong' : pct >= 60 ? 'good' : pct >= 25 ? 'starter' : 'empty',
  };
}
