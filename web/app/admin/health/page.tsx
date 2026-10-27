'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Health {
  ok: boolean;
  window_hours: number;
  total: number;
  by_status: { status: number; n: number }[];
  by_scope: { scope: string; n: number }[];
  top_routes: { route: string; n: number }[];
  last_error_at: string | null;
}
interface Entry {
  id: number;
  scope: string;
  route: string | null;
  status: number | null;
  code: string | null;
  message: string | null;
  created_at: string;
}

interface MailHealth {
  counts: { status: string; n: number }[];
  recent: { id: string; status: string; attempts: number; last_error: string | null; expires_at: number; created_at: number }[];
}
interface JobRun { id: string; job: string; status: string; started_at: number; finished_at: number | null; }

const WINDOWS = [24, 72, 168];
const LABEL: Record<number, string> = { 24: 'Last 24 hours', 72: 'Last 3 days', 168: 'Last 7 days' };

/**
 * Admin → Health.
 *
 * Production software that fails silently fails for weeks. Every 5xx is
 * recorded with its route; this is where they become visible, and the hourly
 * job alerts on the same numbers so a bad hour is not discovered by a buyer.
 */
export default function AdminHealthPage() {
  const [hours, setHours] = useState(24);
  const [health, setHealth] = useState<Health | null>(null);
  const [recent, setRecent] = useState<Entry[]>([]);
  const [rules, setRules] = useState<{ key: string; threshold: number; window_minutes: number }[]>([]);
  const [error, setError] = useState('');
  const [mail, setMail] = useState<MailHealth | null>(null);
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [followups, setFollowups] = useState<{ kind: string; payment_id: number; created_at: string }[]>([]);
  const [replaying, setReplaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ health: Health; recent: Entry[]; mail: MailHealth; jobs: JobRun[]; payment_followups: { oldest_pending: { kind: string; payment_id: number; created_at: string }[] }; alert_rules: { key: string; threshold: number; window_minutes: number }[] }>(
        `/admin/health?hours=${hours}`
      );
      setError('');
      setHealth(d.health);
      setMail(d.mail);
      setJobs(d.jobs ?? []);
      setFollowups(d.payment_followups?.oldest_pending ?? []);
      setRecent(d.recent ?? []);
      setRules(d.alert_rules ?? []);
    } catch (e) {
      setError(extractError(e));
    }
  }, [hours]);
  useEffect(() => {
    load();
  }, [load]);

  async function replay(id: string) {
    if (!window.confirm('Retry this unexpired email intent? It keeps the original content, expiry and provider idempotency key.')) return;
    setReplaying(id);
    try { await capi(`/admin/mail/${id}/replay`, { method: 'POST', body: '{}' }); await load(); }
    catch (e) { setError(extractError(e)); }
    finally { setReplaying(null); }
  }

  const fiveXX = health?.by_status.filter((s) => s.status >= 500).reduce((a, b) => a + b.n, 0) ?? 0;

  return (
    <div>
      <div className="dash-head">
        <h1>Health</h1>
        <div className="chip-row" role="group" aria-label="Window">
          {WINDOWS.map((h) => (
            <button key={h} className={`chip${h === hours ? ' on' : ''}`} onClick={() => setHours(h)}>
              {LABEL[h]}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="form-msg error">{error}</div>}

      <section className="card panel" style={{ marginTop: 14 }} aria-labelledby="payment-followups-title">
        <h2 id="payment-followups-title">Payment follow-ups</h2>
        <p>Paid access and credit holds commit with the payment. Email and referral processing retry every two minutes. Do not manually grant access again to fix an email delay.</p>
        {followups.length ? <ul>{followups.map((row) => <li key={`${row.kind}:${row.payment_id}`}>Payment #{row.payment_id} · {row.kind} · waiting since {new Date(row.created_at).toLocaleString('en-NG')}</li>)}</ul> : <p>No pending payment follow-ups.</p>}
      </section>
      {mail && <section className="card panel" style={{ marginTop: 14 }} aria-labelledby="mail-health-title">
        <h2 id="mail-health-title">Email outbox</h2>
        <p>Sent means accepted by the provider, not confirmed inbox delivery. Recipients and content are never shown here.</p>
        <p>{mail.counts.map((item) => `${item.status}: ${item.n}`).join(' · ') || 'No messages queued.'}</p>
        {mail.recent.length > 0 && <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Intent</th><th>Status</th><th>Attempts</th><th>Last result</th><th>Action</th></tr></thead>
          <tbody>{mail.recent.map((item) => <tr key={item.id}>
            <td><code>{item.id.slice(0, 12)}…</code></td><td>{item.status}</td><td>{item.attempts}</td><td>{item.last_error ?? '—'}</td>
            <td>{item.status === 'dead' && item.expires_at > Date.now() / 1000 ? <button className="mini-btn" disabled={replaying !== null} onClick={() => replay(item.id)}>{replaying === item.id ? 'Queuing…' : 'Retry'}</button> : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>}
      <section className="card panel" style={{ marginTop: 14 }} aria-labelledby="job-health-title">
        <h2 id="job-health-title">Maintenance history</h2>
        <p>A running entry older than twenty minutes needs investigation; abrupt runtime termination may not record a failure.</p>
        {jobs.length ? <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Job</th><th>Status</th><th>Started</th><th>Duration</th></tr></thead>
          <tbody>{jobs.map((job) => <tr key={job.id}><td>{job.job}</td><td>{job.status}</td>
            <td>{new Date(job.started_at * 1000).toLocaleString('en-NG')}</td><td>{job.finished_at === null ? 'Not finished' : `${job.finished_at - job.started_at}s`}</td></tr>)}</tbody>
        </table></div> : <p>No maintenance runs recorded.</p>}
      </section>

      {health && (
        <>
          <div className={health.total === 0 ? 'card panel ok-banner' : fiveXX > 0 ? 'card panel warn-banner' : 'card panel'}>
            <h2 style={{ fontSize: '1.05rem' }}>
              {health.total === 0
                ? `No errors in the last ${hours} hours ✅`
                : fiveXX > 0
                  ? `${fiveXX} server error(s) in the last ${hours} hours`
                  : `${health.total} client-side error(s) in the last ${hours} hours`}
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: -4, marginBottom: 0 }}>
              {health.last_error_at
                ? `Most recent: ${new Date(health.last_error_at).toLocaleString('en-NG')}.`
                : 'Nothing recorded yet.'}{' '}
              A 4xx is a caller mistake; a 5xx is ours and worth chasing.
            </p>
          </div>

          <div className="stat-grid" style={{ marginTop: 14 }}>
            <div className="card panel stat">
              <span className="stat-label">Total</span>
              <strong>{health.total}</strong>
              <span className="stat-sub">in the window</span>
            </div>
            <div className="card panel stat">
              <span className="stat-label">5xx</span>
              <strong style={{ color: fiveXX ? '#ff8a80' : 'var(--em)' }}>{fiveXX}</strong>
              <span className="stat-sub">ours to fix</span>
            </div>
            {health.by_scope.map((s) => (
              <div className="card panel stat" key={s.scope}>
                <span className="stat-label">{s.scope}</span>
                <strong>{s.n}</strong>
                <span className="stat-sub">errors</span>
              </div>
            ))}
          </div>

          {health.top_routes.length > 0 && (
            <div className="card panel" style={{ marginTop: 14 }}>
              <h2 style={{ fontSize: '1.05rem' }}>Where they happen</h2>
              <ul className="device-list">
                {health.top_routes.map((r) => (
                  <li key={r.route}>
                    <code>{r.route}</code>
                    <span className="sla-pill ok">{r.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card panel" style={{ marginTop: 14 }}>
            <h2 style={{ fontSize: '1.05rem' }}>Most recent</h2>
            {recent.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Nothing logged.</p>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Status</th>
                      <th>Route</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.slice(0, 25).map((e) => (
                      <tr key={e.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString('en-NG')}</td>
                        <td>
                          <span className={`sla-pill ${(e.status ?? 0) >= 500 ? 'danger' : 'ok'}`}>{e.status ?? '—'}</span>
                        </td>
                        <td>
                          <code>{e.route || '—'}</code>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                          {e.code ? <strong>{e.code}</strong> : null} {e.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {rules.length > 0 && (
            <div className="card panel" style={{ marginTop: 14 }}>
              <h2 style={{ fontSize: '1.05rem' }}>Alerting</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: -4 }}>
                The hourly job watches these. Each fires at most once an hour, however bad it gets — an alert
                you learn to ignore is worse than no alert.
              </p>
              <ul className="device-list">
                {rules.map((r) => (
                  <li key={r.key}>
                    <code>{r.key}</code>
                    <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {r.threshold}+ per {Math.round(r.window_minutes / 60)}h
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
