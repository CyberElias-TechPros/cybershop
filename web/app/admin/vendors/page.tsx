'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { capi, extractError } from '@/lib/client-api';

interface Vendor {
  id: number;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  email: string;
  phone: string | null;
  plan_name: string | null;
  items: number;
  is_featured?: number;
  /** Set when the store is on a plan granted by CyberShop rather than a paid one. */
  plan_override?: string | null;
  plan_override_reason?: string | null;
  is_platform_owner?: number;
}

const FILTERS = ['all', 'pending_payment', 'pending_approval', 'active', 'suspended', 'rejected'];
const LABELS: Record<string, string> = {
  all: 'All',
  pending_payment: 'Pending payment',
  pending_approval: 'Pending approval',
  active: 'Active',
  suspended: 'Suspended',
  rejected: 'Rejected',
};

function VendorsInner() {
  const sp = useSearchParams();
  const status = sp.get('status') ?? 'all';
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ vendors: Vendor[]; total: number }>(`/admin/vendors?status=${status}`);
      setVendors(d.vendors);
      setTotal(d.total);
    } catch (e) {
      setError(extractError(e));
    }
  }, [status]);
  useEffect(() => {
    load();
  }, [load]);

  async function feature(v: Vendor) {
    const on = !v.is_featured;
    const days = on ? prompt('Feature for how many days? (1–90)', '14') : null;
    if (on && (days === null || !/^\d+$/.test(days))) return;
    setBusyId(v.id);
    setError('');
    try {
      await capi(`/admin/vendors/${v.id}/feature`, { method: 'POST', body: JSON.stringify(on ? { featured: true, days: Number(days) } : { featured: false }) });
      setNotice(on ? `${v.name} is featured.` : `${v.name} is no longer featured.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function act(id: number, action: 'approve' | 'suspend' | 'reactivate' | 'reject') {
    let body = '{}';
    if (action === 'suspend') {
      const note = prompt('Reason (shown to the vendor):', 'Suspended by an administrator.');
      if (note === null) return;
      body = JSON.stringify({ note: note || 'Suspended by an administrator.' });
    }
    if (action === 'reject') {
      if (!confirm('Reject this vendor’s registration? They will be notified with the reason.')) return;
      const reason = prompt('Reason (shown to the vendor):', 'Registration rejected.');
      if (reason === null) return;
      body = JSON.stringify({ reason: reason || 'Registration rejected.' });
    }
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/vendors/${id}/${action}`, { method: 'POST', body });
      setNotice(`Vendor ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'suspend' ? 'suspended' : 'reactivated'}.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Put a store on a plan permanently, at no cost.
   *
   * The reason is mandatory on the server and asked for here: granting the top
   * plan is a money decision, and whoever makes it has to say why on the record.
   */
  async function grantPlan(v: Vendor) {
    const planSlug = prompt(
      `Grant which plan to ${v.name}?\n\nAvailable: free, starter, business, enterprise.\nThe store gets it permanently, at no cost, with no expiry.`,
      v.plan_override ?? 'enterprise'
    );
    if (planSlug === null) return;
    const reason = prompt('Why is this plan being granted? (Recorded in the audit log and shown to the vendor.)');
    if (reason === null || !reason.trim()) {
      setError('A reason is required to grant a plan.');
      return;
    }
    const isOwner = confirm('Is this the platform owner\u2019s own store? It will also be verified and featured permanently.');
    setBusyId(v.id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/vendors/${v.id}/entitlement`, {
        method: 'POST',
        body: JSON.stringify({ plan_slug: planSlug.trim(), reason: reason.trim(), is_platform_owner: isOwner }),
      });
      setNotice(`${v.name} is now on ${planSlug.trim()} — permanently, at no cost.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function revokePlan(v: Vendor) {
    if (!confirm(`Return ${v.name} to a paid plan? They keep the granted plan for 30 days, then it ends.`)) return;
    const reason = prompt('Why is the complimentary plan ending? (Recorded in the audit log.)', '') ?? '';
    setBusyId(v.id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/vendors/${v.id}/entitlement`, { method: 'DELETE', body: JSON.stringify({ reason }) });
      setNotice(`${v.name} has 30 days before the complimentary plan ends.`);
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
        <h1>Vendors</h1>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{total} total</span>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      <div className="biz-cats" style={{ marginBottom: 16 }}>
        {FILTERS.map((s) => (
          <span key={s} className="chip">
            <Link href={`/admin/vendors?status=${s}`} style={{ color: status === s ? '#fff' : undefined, background: status === s ? 'var(--green)' : undefined, display: 'inline-block', borderRadius: 999 }}>
              {LABELS[s]}
            </Link>
          </span>
        ))}
      </div>

      {vendors.length === 0 ? (
        <div className="empty">
          <h2>No vendors in this state</h2>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Business</th>
                <th>Contact</th>
                <th>Plan</th>
                <th>Items</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/business/${v.slug}`}>{v.name}</Link>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>/{v.slug}</div>
                  </td>
                  <td>
                    {v.email}
                    {v.phone && <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{v.phone}</div>}
                  </td>
                  <td>
                    {v.plan_name ?? '—'}
                    {v.plan_override ? (
                      <div style={{ fontSize: '0.75rem', color: 'var(--gold)' }} title={v.plan_override_reason ?? ''}>
                        {v.is_platform_owner ? 'platform owner' : 'granted'} · {v.plan_override}
                      </div>
                    ) : null}
                  </td>
                  <td>{v.items}</td>
                  <td>
                    <span className={`status-pill ${v.status}`}>{v.status.replace('_', ' ')}</span>
                    {v.is_featured ? <span className="status-pill featured">featured</span> : null}
                  </td>
                  <td>{new Date(v.created_at).toLocaleDateString('en-NG')}</td>
                  <td>
                    <div className="row-actions">
                      {v.status === 'pending_payment' || v.status === 'pending_approval' ? (
                        <button className="mini-btn" disabled={busyId === v.id} onClick={() => act(v.id, 'approve')}>
                          Approve
                        </button>
                      ) : null}
                      {v.status === 'active' && (
                        <button className="mini-btn danger" disabled={busyId === v.id} onClick={() => act(v.id, 'suspend')}>
                          Suspend
                        </button>
                      )}
                      {v.status === 'suspended' && (
                        <button className="mini-btn" disabled={busyId === v.id} onClick={() => act(v.id, 'reactivate')}>
                          Reactivate
                        </button>
                      )}
                      {v.status === 'active' && (
                        <button className="mini-btn" disabled={busyId === v.id} onClick={() => feature(v)}>
                          {v.is_featured ? 'Unfeature' : 'Feature'}
                        </button>
                      )}
                      {(v.status === 'pending_payment' || v.status === 'pending_approval') && (
                        <button className="mini-btn danger" disabled={busyId === v.id} onClick={() => act(v.id, 'reject')}>
                          Reject
                        </button>
                      )}
                      {v.plan_override ? (
                        <button className="mini-btn danger" disabled={busyId === v.id} onClick={() => revokePlan(v)}>
                          End grant
                        </button>
                      ) : (
                        <button className="mini-btn" disabled={busyId === v.id} onClick={() => grantPlan(v)}>
                          Grant plan
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminVendorsPage() {
  return (
    <Suspense>
      <VendorsInner />
    </Suspense>
  );
}
