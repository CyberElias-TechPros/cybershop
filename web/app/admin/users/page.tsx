'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface User {
  id: number;
  role: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  last_login_at: string | null;
}

/**
 * Admin → Users: the support directory. Search anyone, verify their state,
 * jump into their account (audited) or email them a reset link.
 */
export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await capi<{ users: User[] }>(`/admin/users?q=${encodeURIComponent(q)}&role=${role}`);
      setUsers(d.users);
      setError('');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  }, [q, role]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce typing
    return () => clearTimeout(t);
  }, [load]);

  async function impersonate(u: User) {
    if (!confirm(`Sign in as ${u.name} (${u.email})? This is recorded in the audit log.`)) return;
    setBusyId(u.id);
    setError('');
    try {
      await capi(`/admin/users/${u.id}/impersonate`, { method: 'POST', body: '{}' });
      window.location.href = u.role === 'vendor' ? '/dashboard' : '/';
    } catch (e) {
      setError(extractError(e));
      setBusyId(null);
    }
  }

  async function setStatus(u: User, next: 'suspend' | 'activate') {
    const verb = next === 'suspend' ? 'Suspend' : 'Activate';
    if (!confirm(`${verb} ${u.name}? ${next === 'suspend' ? 'They will be signed out.' : ''}`)) return;
    setBusyId(u.id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/users/${u.id}/${next}`, { method: 'POST', body: '{}' });
      setNotice(`${u.name} is ${next === 'suspend' ? 'suspended' : 'active'}.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function resetLink(u: User) {
    setBusyId(u.id);
    setError('');
    setNotice('');
    try {
      const d = await capi<{ sent: boolean; message: string; reset_url?: string }>(`/admin/users/${u.id}/reset-link`, { method: 'POST', body: '{}' });
      setNotice(d.message + (d.reset_url ? ` ${d.reset_url}` : ''));
      if (d.reset_url) prompt('No mail provider configured — copy this reset link:', d.reset_url);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Users</h1>
        <span className="dash-sub">Search anyone · audited sign-in-as · resend reset links</span>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}
      <div className="admin-toolbar">
        <input
          className="input"
          placeholder="Search by email or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search users"
        />
        <select className="select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
          <option value="all">All roles</option>
          <option value="vendor">Vendors</option>
          <option value="buyer">Buyers</option>
          <option value="admin">Admins</option>
        </select>
      </div>
      <div className="card panel table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}>
                  <span className="skel" style={{ display: 'block', height: 20 }} />
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--ink-faint)' }}>
                  No users match.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>{u.email}</div>
                </td>
                <td>{u.role}</td>
                <td>
                  <span className={`status-pill ${u.status === 'active' ? 'active' : 'suspended'}`}>{u.status}</span>
                </td>
                <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-NG') : '—'}</td>
                <td>
                  <div className="row-actions">
                    {u.role !== 'admin' && u.status === 'active' && (
                      <button type="button" className="mini-btn" disabled={busyId === u.id} onClick={() => impersonate(u)}>
                        Sign in as
                      </button>
                    )}
                    <button type="button" className="mini-btn" disabled={busyId === u.id} onClick={() => resetLink(u)}>
                      Reset link
                    </button>
                    {u.role !== 'admin' && u.status === 'active' && (
                      <button type="button" className="mini-btn danger" disabled={busyId === u.id} onClick={() => setStatus(u, 'suspend')}>
                        Suspend
                      </button>
                    )}
                    {u.role !== 'admin' && u.status !== 'active' && (
                      <button type="button" className="mini-btn" disabled={busyId === u.id} onClick={() => setStatus(u, 'activate')}>
                        Activate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
