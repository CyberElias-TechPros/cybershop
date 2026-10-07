'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Category {
  key: string;
  label: string;
  help: string;
  in_app: boolean;
  email: boolean;
  default_email: boolean;
}

/**
 * Notification preferences.
 *
 * The choice is never "all notifications" or "none". It is "the lead email,
 * yes; the review email, no". Give someone one switch and they mute the lot —
 * and then they stop coming back, because the email is how they remember the
 * stall exists. So: one row per category.
 *
 * In-app is shown but not switchable: the bell is the record of what happened,
 * and hiding history because someone ticked a box loses things they need.
 */
export default function NotificationPrefs() {
  const [cats, setCats] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ categories: Category[] }>('/account/notification-prefs');
      setCats(d.categories ?? []);
      setDraft(Object.fromEntries((d.categories ?? []).map((c) => [c.key, c.email])));
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const d = await capi<{ categories: Category[] }>('/account/notification-prefs', {
        method: 'PUT',
        body: JSON.stringify({ prefs: Object.entries(draft).map(([category, email]) => ({ category, email })) }),
      });
      setCats(d.categories ?? []);
      setNotice('Notification preferences saved.');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  const changed = cats.some((c) => draft[c.key] !== c.email);

  if (cats.length === 0) return null;

  return (
    <section className="card panel" aria-labelledby="notif-prefs">
      <h2 id="notif-prefs" style={{ fontSize: '1.05rem' }}>
        Notifications
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -4 }}>
        Choose what reaches your email. Everything still appears under the bell in the app — that is your
        record of what happened, so it is always there.
      </p>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      <ul className="pref-list">
        {cats.map((c) => (
          <li key={c.key}>
            <div className="pref-copy">
              <strong>{c.label}</strong>
              <span>{c.help}</span>
            </div>
            <label className="switch" title={`Email me about: ${c.label}`}>
              <input
                type="checkbox"
                checked={draft[c.key] ?? c.default_email}
                onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.checked }))}
              />
              <span className="switch-track" aria-hidden="true" />
              <span className="switch-label">Email</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy || !changed} onClick={save}>
          {busy ? 'Saving…' : 'Save preferences'}
        </button>
        {changed && (
          <button className="btn btn-ghost" onClick={() => setDraft(Object.fromEntries(cats.map((c) => [c.key, c.email])))}>
            Undo
          </button>
        )}
      </div>
    </section>
  );
}
