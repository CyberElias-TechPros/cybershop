import { cache } from 'react';
import { api } from './api';
import { DEFAULT_SAFETY, type SiteSafety } from './safety';

export { DEFAULT_SAFETY, type SiteSafety } from './safety';

/**
 * Platform-wide settings (name, support contacts, trust & safety copy).
 *
 * Fetched through `api()` (React-cached per render pass), so the footer, the
 * site-wide safety ribbon and the safety page share ONE Worker round-trip no
 * matter how many of them render — and a slow or failing catalogue never
 * removes the safety notice, because the defaults live here too.
 */

export interface SiteInfo {
  name: string;
  tagline: string;
  support_email: string;
  whatsapp_support: string | null;
  safety: SiteSafety;
}

const FALLBACK: SiteInfo = {
  name: 'CyberShop',
  tagline: 'Find a business. Talk to it on WhatsApp.',
  support_email: 'support@cybershop.ng',
  whatsapp_support: null,
  safety: DEFAULT_SAFETY,
};

export const siteInfo = cache(async (): Promise<SiteInfo> => {
  try {
    const d = await api<{ site: Partial<SiteInfo> }>('/public/site');
    const s = d.site ?? {};
    const safety = s.safety ?? DEFAULT_SAFETY;
    return {
      name: s.name || FALLBACK.name,
      tagline: s.tagline || FALLBACK.tagline,
      support_email: s.support_email || FALLBACK.support_email,
      whatsapp_support: s.whatsapp_support ?? null,
      safety: {
        enabled: safety.enabled !== false,
        headline: safety.headline || DEFAULT_SAFETY.headline,
        notice: safety.notice || DEFAULT_SAFETY.notice,
        tips: Array.isArray(safety.tips) && safety.tips.length ? safety.tips : DEFAULT_SAFETY.tips,
      },
    };
  } catch {
    // Never let a catalogue outage strip the safety notice from the page.
    return FALLBACK;
  }
});
