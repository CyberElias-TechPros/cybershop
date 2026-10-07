'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Sla {
  due_at: string;
  hours_left: number;
  breached: boolean;
}
interface Report {
  id: number;
  reporter_email: string | null;
  assignee_email: string | null;
  entity_type: string;
  entity_id: number;
  business_name: string | null;
  listing_name: string | null;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  resolution_note: string | null;
  created_at: string;
  triaged_at: string | null;
  resolved_at: string | null;
  sla: Sla | null;
}

const STATUSES = ['open', 'investigating', 'resolved', 'dismissed'];

const OUTCOMES: { value: string; label: string; effect: string }[] = [
  { value: 'no_action', label: 'Nothing to do', effect: 'closes the report, changes nothing' },
  { value: 'warning_sent', label: 'Warned the seller', effect: 'closes the report, warns' },
  { value: 'content_removed', label: 'Remove the listing', effect: 'unpublishes the listing' },
  { value: 'store_suspended', label: 'Suspend the store', effect: 'suspends the store' },
  { value: 'unfounded', label: 'Not substantiated', effect: 'closes the report' },
];

function slaLabel(sla: Sla | null): { text: string; tone: string } {
  if (!sla) return { text: 'no clock', tone: 'faint' };
  if (sla.breached) {
    const over = Math.abs(Math.round(sla.hours_left));
    return { text: `${over}h overdue`, tone: 'danger' };
  }
  if (sla.hours_left <= 6) return { text: `${Math.round(sla.hours_left)}h left`, tone: 'warn' };
  return { text: `${Math.round(sla.hours_left)}h left`, tone: 'ok' };
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('open');
  const [mine, setMine] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [closing, setClosing] = useState<Report | null>(null);
  const [outcome, setOutcome] = useState('no_action');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ reports: Report[]; counts: { status: string; n: number }[]; sla_hours: number }>(
        `/admin/reports?status=${status}${mine ? '&scope=mine' : ''}`
      );
      setReports(d.reports ?? []);
      setCounts(Object.fromEntries((d.counts ?? []).map((c) => [c.status, Number(c.n)])));
    } catch (e) {
      setError(extractError(e));
    }
  }, [status, mine]);
  useEffect(() => {
    load();
  }, [load]);

  async function claim(id: number) {
    setBusyId(id);
    setError('');
    try {
      await capi(`/admin/reports/${id}/claim`, { method: 'POST', body: '{}' });
      setNotice(`Report #${id} is yours.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function closeReport(finish: 'resolved' | 'dismissed') {
    if (!closing) return;
    setBusyId(closing.id);
    setError('');
    try {
      const r = await capi<{ acted?: string | null }>(`/admin/reports/${closing.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status: finish, outcome, note, act: true }),
      });
      setNotice(
        `Report #${closing.id} ${finish}.${r.acted ? ` ${r.acted[0]!.toUpperCase()}${r.acted.slice(1)}.` : ''} The reporter has been told.`
      );
      setClosing(null);
      setNote('');
      setOutcome('no_action');
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
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {counts.open ?? 0} open · answered within 48h
        </span>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      <div className="biz-cats" style={{ marginBottom: 12 }}>
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`chip${s === status ? ' on' : ''}`}
            onClick={() => setStatus(s)}
            style={{ background: s === status ? 'var(--em)' : undefined, color: s === status ? '#04150d' : undefined }}
          >
            {s} ({counts[s] ?? 0})
          </button>
        ))}
        <button
          className={`chip${mine ? ' on' : ''}`}
          onClick={() => setMine((v) => !v)}
          title="Only what is assigned to you, plus anything unclaimed"
          style={{ background: mine ? 'var(--em)' : undefined, color: mine ? '#04150d' : undefined }}
        >
          {mine ? '✓ my queue' : 'my queue'}
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="empty">
          <h2>Nothing here 🎉</h2>
          <p>
            {status === 'open'
              ? 'No open reports. Buyers can report a listing or a store from any page.'
              : `No reports with status “${status}”.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {reports.map((r) => {
            const s = slaLabel(r.sla);
            return (
              <div className="card panel" key={r.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="status-pill new">{r.reason.replace('_', ' ')}</span>{' '}
                    <strong>
                      {r.entity_type} #{r.entity_id}
                    </strong>
                    {(r.listing_name || r.business_name) && (
                      <>
                        {' '}
                        <span style={{ color: 'var(--muted)' }}>
                          {r.listing_name ? `“${r.listing_name}”` : r.business_name}
                        </span>
                      </>
                    )}
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
                      {r.reporter_email ? `by ${r.reporter_email} · ` : 'anonymous · '}
                      {new Date(r.created_at).toLocaleString('en-NG')}
                      {r.assignee_email ? ` · owned by ${r.assignee_email}` : ' · unclaimed'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {r.status !== 'resolved' && r.status !== 'dismissed' && (
                      <span className={`sla-pill ${s.tone}`} title={`Due ${new Date(r.sla?.due_at ?? '').toLocaleString('en-NG')}`}>
                        {s.text}
                      </span>
                    )}
                    <div className="row-actions">
                      {r.status !== 'resolved' && r.status !== 'dismissed' && (
                        <>
                          {!r.assignee_email && (
                            <button className="mini-btn" disabled={busyId === r.id} onClick={() => claim(r.id)}>
                              Claim
                            </button>
                          )}
                          <button
                            className="mini-btn"
                            disabled={busyId === r.id}
                            onClick={() => {
                              setClosing(r);
                              setOutcome('no_action');
                              setNote('');
                            }}
                          >
                            Decide…
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {r.details && (
                  <p style={{ fontSize: '0.9rem', background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', margin: '10px 0 0' }}>
                    {r.details}
                  </p>
                )}

                {r.resolution && (
                  <p style={{ fontSize: '0.86rem', color: 'var(--muted)', margin: '10px 0 0' }}>
                    Closed as <strong>{r.resolution.replace(/_/g, ' ')}</strong>
                    {r.resolved_at ? ` on ${new Date(r.resolved_at).toLocaleDateString('en-NG')}` : ''}
                    {r.resolution_note ? ` — ${r.resolution_note}` : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {closing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Decide report ${closing.id}`}>
          <div className="card panel modal">
            <h2 style={{ fontSize: '1.05rem' }}>
              Decide report #{closing.id} — {closing.reason.replace('_', ' ')} on {closing.entity_type} #{closing.entity_id}
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: -4 }}>
              Whatever you pick, the person who reported this gets told the outcome. That is the point — an
              unanswered report is how buyers decide reporting is theatre.
            </p>

            <label className="field">
              <span className="label">Outcome</span>
              <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} — {o.effect}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="label">Note (internal, and shared with the reporter)</span>
              <textarea
                className="input"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What you found."
              />
            </label>

            <div className="form-actions">
              <button className="btn btn-primary" disabled={busyId === closing.id} onClick={() => closeReport('resolved')}>
                Resolve
              </button>
              <button className="btn btn-ghost" disabled={busyId === closing.id} onClick={() => closeReport('dismissed')}>
                Dismiss as unfounded
              </button>
              <button className="btn btn-ghost" onClick={() => setClosing(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
