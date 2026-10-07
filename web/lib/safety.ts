/**
 * Shared trust & safety copy — safe to import from client components.
 *
 * Kept apart from `lib/site.ts` (which reaches for `next/headers`) so the
 * admin console can render the same defaults without dragging server-only
 * modules into the browser bundle.
 */

export interface SiteSafety {
  enabled: boolean;
  headline: string;
  notice: string;
  tips: string[];
}

export const DEFAULT_SAFETY: SiteSafety = {
  enabled: true,
  headline: 'CyberShop never collects payment',
  notice:
    'We are a catalogue and an introduction, not a shop. Agree the details on WhatsApp, then verify the goods or service and only pay the seller once you are satisfied.',
  tips: [
    'Inspect or verify before you pay — a live video, a receipt, or a public meetup.',
    'Never pay a “CyberShop fee”, a “delivery deposit” or any account we did not give you.',
    'Keep the conversation on WhatsApp — it is your receipt if anything goes wrong.',
    'If a deal feels rushed or too cheap, walk away and report the listing.',
  ],
};
