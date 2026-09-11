'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Log {
  id: number;
  actor_user_id: number | null;
  actor_role: string;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  ip: string | null;
  meta: string | null;
  created_at: string;
  actor_email: string | null;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    capi<{ logs: Log[] }>('/admin/audit?page=1')
      .then((d) => setLogs(d.logs))
      .catch((e) => setError(extractError(e)));
  }, []);

  return (
    <div>
      <div className="dash-head">
        <h1>Audit log</h1>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Latest 30 actions</span>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {logs.length === 0 ? (
        <div className="empty">
          <h2>No audit entries yet</h2>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>IP</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                let meta = '';
                try {
                  const m = l.meta ? JSON.parse(l.meta) : null;
                  if (m && typeof m === 'object') meta = Object.entries(m).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ');
                } catch {
                  meta = l.meta ?? '';
                }
                return (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{l.action}</td>
                    <td>
                      {l.actor_user_id === null ? (
                        <span className="chip">system</span>
                      ) : (
                        <>
                          {l.actor_email ?? l.actor_user_id}
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{l.actor_role}</div>
                        </>
                      )}
                    </td>
                    <td>
                      {l.entity_type ? (
                        <>
                          {l.entity_type} {l.entity_id ? `#${l.entity_id}` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{l.ip ?? '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
