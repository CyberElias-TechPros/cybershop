'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Row {
  id: number;
  status: string;
  created_at: string;
  item_name: string | null;
  business_name: string;
  business_slug: string;
  variant_label: string | null;
  message: string | null;
}

export default function EnquiriesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    capi<{ inquiries: Row[] }>('/account/inquiries').then((d) => setRows(d.inquiries)).catch((e) => setError(extractError(e)));
  }, []);
  return (
    <div>
      <div className="dash-head"><h1>Your enquiries</h1></div>
      <p style={{ color: 'var(--muted)' }}>These are the WhatsApp messages CyberShop prepared for you. The sale still happens in the chat.</p>
      {error && <div className="form-msg error">{error}</div>}
      {rows.length === 0 ? <p>No enquiries yet. Open a listing and tap Enquire on WhatsApp.</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r) => (
            <article className="card panel" key={r.id}>
              <strong>{r.item_name || 'General enquiry'}</strong>
              <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                <a href={`/business/${r.business_slug}`}>{r.business_name}</a> · {r.status} · {new Date(r.created_at).toLocaleString('en-NG')}
                {r.variant_label ? ` · ${r.variant_label}` : ''}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
