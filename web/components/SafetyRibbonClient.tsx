'use client';

import { useEffect, useState } from 'react';

const KEY = 'cs-safety-ribbon';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Runs before first paint: a snoozed notice is hidden by CSS immediately, so
 * returning buyers do not see it flash and re-layout the page. Without JS the
 * class is never added and the notice stays — which is the behaviour we want.
 */
const SNOOZE_JS = `try{var r=localStorage.getItem('${KEY}');if(r&&Date.now()-Number(r)<${SNOOZE_MS}){document.documentElement.classList.add('safety-snoozed');}}catch(e){}`;

/**
 * The site-wide "verify before you pay" ribbon.
 *
 * Rendered on every page by the root layout, so nobody reaches a WhatsApp
 * button without having seen that CyberShop is not a shop and never holds
 * buyer money. Dismissal is remembered for a week — the notice must not become
 * a wall people learn to close on reflex, but it must be there for new and
 * returning buyers alike.
 *
 * It is server-rendered (visible in the raw HTML, present without JavaScript)
 * and only hidden afterwards, by the pre-paint script above.
 */
export default function SafetyRibbonClient({ headline, notice, tips }: { headline: string; notice: string; tips: string[] }) {
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (document.documentElement.classList.contains('safety-snoozed')) setHidden(true);
  }, []);

  if (hidden) return null;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SNOOZE_JS }} />
      <div className="safety-ribbon" role="region" aria-label="Safety notice">
        <div className="safety-ribbon-inner">
          <span className="safety-ribbon-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3z" strokeLinejoin="round" />
              <path d="M9.3 12.2l1.9 1.9 3.6-3.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="safety-ribbon-text">
            <strong>{headline}.</strong> {notice}
          </p>
          <button
            type="button"
            className="safety-ribbon-more"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide tips' : 'Safety tips'}
          </button>
          <button
            type="button"
            className="safety-ribbon-close"
            aria-label="Dismiss safety notice"
            onClick={() => {
              setHidden(true);
              try {
                localStorage.setItem(KEY, String(Date.now()));
              } catch {
                /* private mode — it comes back next visit, which is fine */
              }
            }}
          >
            ✕
          </button>
        </div>
        {open && (
          <div className="safety-ribbon-tips">
            <ul>
              {tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <a href="/safety">Read the full safety guide →</a>
          </div>
        )}
      </div>
    </>
  );
}
