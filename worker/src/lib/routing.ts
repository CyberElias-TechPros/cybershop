import type { Env } from '../config';

export interface WaTarget {
  id: number;
  number: string;
}

/**
 * Smart routing (plan §63), still a wa.me deep link — never the Business API.
 * Order: item pin → item-type route → category route → store default.
 */
export async function resolveWhatsappNumber(
  env: Env,
  businessId: number,
  opts: { whatsapp_number_id?: number | null; item_type_id?: number | null; category_id?: number | null }
): Promise<WaTarget | null> {
  const active = `status = 'active' AND deleted_at IS NULL AND business_id = ?`;
  if (opts.whatsapp_number_id) {
    const pinned = (await env.DB.prepare(
      `SELECT id, number FROM whatsapp_numbers WHERE id = ? AND ${active}`
    ).bind(opts.whatsapp_number_id, businessId).first()) as WaTarget | null;
    if (pinned) return pinned;
  }
  if (opts.item_type_id) {
    const byType = (await env.DB.prepare(
      `SELECT id, number FROM whatsapp_numbers WHERE route_item_type_id = ? AND ${active} ORDER BY is_default DESC, id LIMIT 1`
    ).bind(opts.item_type_id, businessId).first()) as WaTarget | null;
    if (byType) return byType;
  }
  if (opts.category_id) {
    const byCat = (await env.DB.prepare(
      `SELECT id, number FROM whatsapp_numbers WHERE route_category_id = ? AND ${active} ORDER BY is_default DESC, id LIMIT 1`
    ).bind(opts.category_id, businessId).first()) as WaTarget | null;
    if (byCat) return byCat;
  }
  return (await env.DB.prepare(
    `SELECT id, number FROM whatsapp_numbers WHERE is_default = 1 AND ${active} ORDER BY id LIMIT 1`
  ).bind(businessId).first()) as WaTarget | null;
}
