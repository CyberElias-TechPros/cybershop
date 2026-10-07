import { siteInfo } from '@/lib/site';

/**
 * "Verify before you pay" — the trust block shown next to every WhatsApp CTA.
 *
 * CyberShop is a catalogue and an introduction: we never collect buyer payment,
 * never hold goods and never sit in the middle of a deal. That has to be said
 * *before* the visitor is handed to a stranger on WhatsApp, in plain language,
 * every single time. The copy is admin-editable (platform_settings.safety).
 *
 * `compact` is the version inside the WhatsApp card; the full version (used on
 * /safety and the storefront) adds the report link and the longer list.
 */
export default async function SafetyTips({ compact = false }: { compact?: boolean }) {
  const { safety } = await siteInfo();
  const tips = safety.tips.slice(0, compact ? 3 : 6);

  return (
    <aside className={`safety-tips${compact ? ' compact' : ''}`} aria-labelledby="safety-title">
      <h2 id="safety-title">
        <span className="safety-tips-mark" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3z" strokeLinejoin="round" />
            <path d="M9.3 12.2l1.9 1.9 3.6-3.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {safety.headline}
      </h2>
      <p className="safety-tips-lede">{safety.notice}</p>
      <ol>
        {tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      {!compact && (
        <p className="safety-tips-foot">
          Seen something off? Use <strong>⚑ Report</strong> on the listing — every report is
          reviewed by a human.{' '}
          <a href="/safety">How to buy and sell safely →</a>
        </p>
      )}
    </aside>
  );
}
