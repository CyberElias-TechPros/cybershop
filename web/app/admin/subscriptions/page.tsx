'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Row {
  id: number;
  status: string;
  expires_at: string | null;
  business_name: string;
  business_status: string;
  plan_name: string;
  owner_email: string;
}

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    capi<{ subscriptions: Row[] }>('/admin/subscriptions').then((d) => setRows(d.subscriptions)).catch((e) => setError(extractError(e)));
  }, []);
  return (
    <div>
      <div className="dash-head"><h1>Subscriptions</h1></div>
      {error && <div className="form-msg error">{error}</div>}
      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>Store</th><th>Plan</th><th>Sub</th><th>Store status</th><th>Expires</th><th>Owner</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.business_name}</td>
                <td>{r.plan_name}</td>
                <td>{r.status}</td>
                <td>{r.business_status}</td>
                <td>{r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-NG') : '—'}</td>
                <td>{r.owner_email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
