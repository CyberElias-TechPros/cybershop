'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Report {
  id: number;
  reporter_email: string | null;
  entity_type: string;
  entity_id: number;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  resolution_note: string | null;
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ reports: Report[] }>('/admin/reports?status=open');
      setReports(d.reports);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: number, status: 'resolved' | 'dismissed' | 'investigating') {
    const note = status === 'resolved' ? prompt('Resolution note (optional):', '') : status === 'dismissed' ? 'Dismissed.' : 'Under investigation.';
    if (status !== 'investigating' && note === null) return;
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status, note: note ?? '' }) });
      setNotice(`Report ${status}.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Reports</h1>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{reports.length} open</span>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}
      {reports.length === 0 ? (
        <div className="empty">
          <h2>No open reports 🎉</h2>
          <p>User reports (spam, fraud, misleading, abusive) land here for review.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {reports.map((r) => (
            <div className="card panel" key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <span className="status-pill new">
                    {r.reason}
                  </span>{' '}
                  <strong>
                    {r.entity_type} #{r.entity_id}
                  </strong>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    {r.reporter_email ? `by ${r.reporter_email} · ` : 'anonymous · '}
                    {new Date(r.created_at).toLocaleString('en-NG')}
                  </div>
                </div>
                <div className="row-actions">
                  <button className="mini-btn" disabled={busyId === r.id} onClick={() => resolve(r.id, 'investigating')}>
                    Investigate
                  </button>
                  <button className="mini-btn" disabled={busyId === r.id} onClick={() => resolve(r.id, 'resolved')}>
                    Resolve
                  </button>
                  <button className="mini-btn danger" disabled={busyId === r.id} onClick={() => resolve(r.id, 'dismissed')}>
                    Dismiss
                  </button>
                </div>
              </div>
              {r.details && <p style={{ fontSize: '0.9rem', background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', margin: '10px 0 0' }}>{r.details}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
