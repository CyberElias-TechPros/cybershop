'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Row {
  id: number;
  name: string;
  slug: string;
  custom_domain: string;
  custom_domain_status: string;
}

export default function AdminDomains() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    capi<{ domains: Row[] }>('/admin/domains').then((d) => setRows(d.domains)).catch((e) => setError(extractError(e)));
  }, []);
  return (
    <div>
      <div className="dash-head"><h1>Custom domains</h1></div>
      <p style={{ color: 'var(--muted)' }}>Vendors prove ownership with a TXT record. TLS attaches only when Vercel credentials are configured.</p>
      {error && <div className="form-msg error">{error}</div>}
      {rows.length === 0 ? <p>No custom domains yet.</p> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Store</th><th>Domain</th><th>DNS</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.custom_domain}</td>
                  <td>{r.custom_domain_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
