'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Member { user_id: number; role: string; status: string; name: string; email: string }
interface Invite { id: number; email: string; role: string; expires_at: string }

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [limit, setLimit] = useState(0);
  const [used, setUsed] = useState(0);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('catalogue');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const d = await capi<{ members: Member[]; invites: Invite[]; limit: number; used: number }>('/vendor/staff');
    setMembers(d.members);
    setInvites(d.invites);
    setLimit(d.limit);
    setUsed(d.used);
  }
  useEffect(() => { load().catch((e) => setError(extractError(e))); }, []);

  return (
    <div>
      <div className="dash-head"><h1>Team</h1></div>
      <p style={{ color: 'var(--muted)' }}>
        Seats used: {used}/{limit < 0 ? 'unlimited' : limit}. Catalogue can edit listings. Sales handles leads and WhatsApp. Support handles leads and inbox. Accountant handles billing. Managers can do everything except remove the owner.
      </p>
      {error && <div className="form-msg error">{error}</div>}
      {link && <div className="form-msg success">Invite link (also emailed when mail is configured): {link}</div>}
      <form
        className="card panel form-row"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            const r = await capi<{ invite_url: string }>('/vendor/staff/invite', { method: 'POST', body: JSON.stringify({ email, role }) });
            setLink(r.invite_url);
            setEmail('');
            await load();
          } catch (err) { setError(extractError(err)); }
        }}
      >
        <label className="field">Email<input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Role
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
            {['manager', 'catalogue', 'sales', 'support', 'accountant'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">Invite</button>
      </form>
      <h2>People</h2>
      {members.length === 0 ? <p>No staff yet.</p> : (
        <ul>
          {members.map((m) => (
            <li key={m.user_id}>
              {m.name} · {m.email} ·{' '}
              <select className="select" style={{ width: 'auto' }} defaultValue={m.role} aria-label={`Role for ${m.name}`} onChange={async (e) => { await capi(`/vendor/staff/${m.user_id}`, { method: 'PUT', body: JSON.stringify({ role: e.target.value }) }); }}>
                {['manager', 'catalogue', 'sales', 'support', 'accountant'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>{' '}
              <button className="mini-btn danger" type="button" onClick={async () => { await capi(`/vendor/staff/${m.user_id}`, { method: 'DELETE' }); await load(); }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {invites.length > 0 && (
        <>
          <h2>Pending invites</h2>
          <ul>{invites.map((i) => <li key={i.id}>{i.email} · {i.role} · expires {new Date(i.expires_at).toLocaleDateString('en-NG')}</li>)}</ul>
        </>
      )}
    </div>
  );
}
