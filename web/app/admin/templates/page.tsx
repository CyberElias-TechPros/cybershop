'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Template {
  id: number;
  label: string;
  body: string;
  is_active: number;
  type_name: string | null;
}

const VARS = ['{{business_name}}', '{{business_url}}', '{{item_name}}', '{{item_url}}', '{{price}}', '{{quantity}}', '{{customer_name}}'];

/**
 * Admin → WhatsApp templates: edit the exact pre-filled message buyers send.
 * Changes are live immediately — no deploy. Keep {{vars}} intact; they are
 * rendered per item server-side.
 */
export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ templates: Template[] }>('/admin/templates');
      setTemplates(d.templates);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(t: Template) {
    setBusyId(t.id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/templates/${t.id}`, { method: 'PUT', body: JSON.stringify({ body: t.body, is_active: Boolean(t.is_active) }) });
      setSavedId(t.id);
      setNotice(`“${t.label}” saved — live for new enquiries immediately.`);
      setTimeout(() => setSavedId(null), 2200);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>WhatsApp templates</h1>
        <span className="dash-sub">The pre-filled message buyers send. Edits go live instantly.</span>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}
      <p className="template-vars">
        Available variables (rendered per item):{' '}
        {VARS.map((v) => (
          <code key={v}>{v}</code>
        ))}
      </p>
      <div className="template-list">
        {templates.map((t) => (
          <div className="card panel template-card" key={t.id}>
            <div className="template-head">
              <strong>
                {t.label} {t.type_name ? <em className="template-type">{t.type_name}</em> : <em className="template-type">all item types</em>}
              </strong>
              <label className="template-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(t.is_active)}
                  onChange={(e) => setTemplates((ts) => ts.map((x) => (x.id === t.id ? { ...x, is_active: e.target.checked ? 1 : 0 } : x)))}
                />
                Active
              </label>
            </div>
            <textarea
              className="textarea template-body"
              rows={7}
              value={t.body}
              onChange={(e) => setTemplates((ts) => ts.map((x) => (x.id === t.id ? { ...x, body: e.target.value } : x)))}
              aria-label={`Message body for ${t.label}`}
            />
            <div className="form-actions">
              <span className="spacer" />
              <button type="button" className="btn btn-primary" disabled={busyId === t.id} onClick={() => save(t)}>
                {busyId === t.id ? 'Saving…' : savedId === t.id ? 'Saved ✓' : 'Save template'}
              </button>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="empty">
            <span className="empty-icon floaty" aria-hidden>
              ✉️
            </span>
            <h2>No templates yet</h2>
            <p>Item types ship with defaults — seed data includes them.</p>
          </div>
        )}
      </div>
    </div>
  );
}
