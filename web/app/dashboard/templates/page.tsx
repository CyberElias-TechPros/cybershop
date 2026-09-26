'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Template {
  id: number;
  name: string;
  body: string;
  business_id: number | null;
  item_type_slug: string | null;
  item_type_name: string | null;
}

export default function TemplatesPage() {
  const [rows, setRows] = useState<Template[]>([]);
  const [name, setName] = useState('My enquiry');
  const [body, setBody] = useState('Hello {{business_name}}, I am interested in {{item_name}} ({{price}}). {{item_url}}');
  const [type, setType] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const d = await capi<{ templates: Template[] }>('/vendor/templates');
    setRows(d.templates);
  }
  useEffect(() => { load().catch((e) => setError(extractError(e))); }, []);

  return (
    <div>
      <div className="dash-head"><h1>WhatsApp templates</h1></div>
      <p style={{ color: 'var(--muted)' }}>Your copies override the platform message for that item type. Placeholders: {'{{business_name}} {{item_name}} {{item_url}} {{price}} {{quantity}}'}.</p>
      {error && <div className="form-msg error">{error}</div>}
      <form
        className="card panel"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await capi('/vendor/templates', { method: 'POST', body: JSON.stringify({ name, body, item_type_slug: type || null }) });
            await load();
          } catch (err) { setError(extractError(err)); }
        }}
      >
        <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="field">Item type slug (blank = all)<input className="input" value={type} onChange={(e) => setType(e.target.value)} placeholder="product" /></label>
        <label className="field">Message<textarea className="textarea" required minLength={8} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <button className="btn btn-primary" type="submit">Save my template</button>
      </form>
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {rows.map((t) => (
          <article key={t.id} className="card panel">
            <strong>{t.name}</strong>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{t.business_id ? 'Yours' : 'Platform default'} · {t.item_type_name || 'Any type'}</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{t.body}</pre>
          </article>
        ))}
      </div>
    </div>
  );
}
