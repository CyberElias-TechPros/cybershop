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

  const load = useCallback(async () => {
    try {
      const d = await capi<{ health: Health; recent: Entry[]; alert_rules: { key: string; threshold: number; window_minutes: number }[] }>(
        `/admin/health?hours=${hours}`
      );
      setHealth(d.health);
      setRecent(d.recent ?? []);
      setRules(d.alert_rules ?? []);
    } catch (e) {
      setError(extractError(e));
    }
  }, [hours]);
  useEffect(() => {
    load();
  }, [load]);

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
