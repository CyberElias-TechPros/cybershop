'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  interval: string;
  trial_days: number;
  quota: string;
  features: string;
  is_active: number;
  sort_order: number;
}
interface Addon {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  unit: string;
  price: number;
  duration_days: number;
  is_active: number;
  sort_order: number;
}

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const QUOTA_KEYS: [string, string][] = [
  ['max_whatsapp_numbers', 'WhatsApp numbers'],
  ['max_storage_mb', 'Storage (MB)'],
  ['max_listings', 'Listings'],
  ['max_categories', 'Categories'],
  ['max_staff', 'Staff seats'],
  ['featured_listings', 'Featured listings'],
];
const ADDON_TYPES = ['extra_whatsapp_number', 'extra_storage', 'featured_listing', 'extra_category', 'staff_account', 'custom_domain', 'advanced_analytics'];

function parseJson<T>(v: string | null, fallback: T): T {
  try {
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [planDraft, setPlanDraft] = useState<Partial<Plan> | null>(null);
  const [addonDraft, setAddonDraft] = useState<Partial<Addon> | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([capi<{ plans: Plan[] }>('/admin/plans'), capi<{ addons: Addon[] }>('/admin/addons')]);
      setPlans(p.plans);
      setAddons(a.addons);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function savePlan() {
    if (!planDraft) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = {
        name: planDraft.name,
        slug: planDraft.slug,
        description: planDraft.description || null,
        price_kobo: planDraft.price,
        interval: planDraft.interval,
        trial_days: planDraft.trial_days ?? 0,
        quota: parseJson<Record<string, number>>(planDraft.quota ?? '{}', {}),
        features: parseJson<string[]>(planDraft.features ?? '[]', []),
        is_active: planDraft.is_active,
        sort_order: planDraft.sort_order ?? 0,
      };
      if (planDraft.id) await capi(`/admin/plans/${planDraft.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await capi('/admin/plans', { method: 'POST', body: JSON.stringify(body) });
      setNotice('Plan saved.');
      setPlanDraft(null);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(p: Plan) {
    if (!confirm(`Delete plan "${p.name}"? Fails if subscriptions use it — deactivate it instead.`)) return;
    setBusy(true);
    setError('');
    try {
      await capi(`/admin/plans/${p.id}`, { method: 'DELETE' });
      setNotice('Plan deleted.');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveAddon() {
    if (!addonDraft) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = {
        name: addonDraft.name,
        description: addonDraft.description || null,
        price_kobo: addonDraft.price,
        duration_days: addonDraft.duration_days ?? 30,
        is_active: addonDraft.is_active,
      };
      if (addonDraft.id) await capi(`/admin/addons/${addonDraft.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else
        await capi('/admin/addons', {
          method: 'POST',
          body: JSON.stringify({ ...body, slug: addonDraft.slug, type: addonDraft.type, unit: addonDraft.unit ?? '1', sort_order: addonDraft.sort_order ?? 0 }),
        });
      setNotice('Add-on saved.');
      setAddonDraft(null);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeAddon(a: Addon) {
    if (!confirm(`Delete add-on "${a.name}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await capi(`/admin/addons/${a.id}`, { method: 'DELETE' });
      setNotice('Add-on deleted.');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Plans & add-ons</h1>
        <button className="btn btn-primary" onClick={() => setPlanDraft({ name: '', slug: '', description: '', price: 0, interval: 'monthly', trial_days: 0, is_active: 1, sort_order: plans.length })}>
          + New plan
        </button>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>Plans</h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Interval</th>
                <th>Key quotas</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const q = parseJson<Record<string, number>>(p.quota, {});
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--muted)' }}>{p.slug}</span>
                      {p.description && <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{p.description}</div>}
                    </td>
                    <td>{p.price === 0 ? 'Free' : naira(p.price)}</td>
                    <td>{p.interval}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {q.max_listings ?? 0} listings · {q.max_whatsapp_numbers ?? 0} numbers · {q.max_storage_mb ?? 0}MB
                    </td>
                    <td>{p.is_active ? '✅' : '⏸️'}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="mini-btn"
                          onClick={() =>
                            setPlanDraft({ ...p, features: p.features, quota: p.quota, is_active: p.is_active ? 1 : 0 })
                          }
                        >
                          Edit
                        </button>
                        <button className="mini-btn danger" onClick={() => removePlan(p)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {planDraft && (
        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>{planDraft.id ? 'Edit plan' : 'New plan'}</h2>
          <div className="form-row">
            <div className="field">
              <label>Name</label>
              <input className="input" value={planDraft.name ?? ''} onChange={(e) => setPlanDraft({ ...planDraft, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Slug</label>
              <input className="input" value={planDraft.slug ?? ''} onChange={(e) => setPlanDraft({ ...planDraft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Price (₦, 0 = free)</label>
              <input className="input" type="number" min="0" value={Math.round((planDraft.price ?? 0) / 100)} onChange={(e) => setPlanDraft({ ...planDraft, price: (Number(e.target.value) || 0) * 100 })} />
            </div>
            <div className="field">
              <label>Interval</label>
              <select className="select" value={planDraft.interval} onChange={(e) => setPlanDraft({ ...planDraft, interval: e.target.value })}>
                <option value="once">one-time</option>
                <option value="monthly">monthly</option>
                <option value="quarterly">quarterly</option>
                <option value="yearly">yearly</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Description</label>
              <input className="input" value={planDraft.description ?? ''} onChange={(e) => setPlanDraft({ ...planDraft, description: e.target.value })} />
            </div>
            <div className="field">
              <label>Features (one per line)</label>
              <textarea
                className="textarea"
                value={parseJson<string[]>(planDraft.features ?? null, []).join('\n')}
                onChange={(e) => setPlanDraft({ ...planDraft, features: JSON.stringify(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)) })}
              />
            </div>
          </div>
          <h3 style={{ fontSize: '0.92rem', margin: '12px 0 6px' }}>Quotas</h3>
          <div className="form-row">
            {QUOTA_KEYS.map(([k, label]) => (
              <div className="field" key={k}>
                <label>{label} (-1 = unlimited)</label>
                <input
                  className="input"
                  type="number"
                  value={parseJson<Record<string, number>>(planDraft.quota ?? null, {})[k] ?? 0}
                  onChange={(e) => {
                    const q = parseJson<Record<string, number>>(planDraft.quota ?? null, {});
                    setPlanDraft({ ...planDraft, quota: JSON.stringify({ ...q, [k]: Number(e.target.value) || 0 }) });
                  }}
                />
              </div>
            ))}
          </div>
          <label style={{ display: 'flex', gap: 8, fontSize: '0.92rem' }}>
            <input type="checkbox" checked={!!planDraft.is_active} onChange={(e) => setPlanDraft({ ...planDraft, is_active: e.target.checked ? 1 : 0 })} />
            Active (visible to vendors)
          </label>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setPlanDraft(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={savePlan} disabled={busy}>
              {busy ? 'Saving…' : 'Save plan'}
            </button>
          </div>
        </div>
      )}

      <div className="card panel">
        <div className="dash-head" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Add-ons</h2>
          <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={() => setAddonDraft({ name: '', slug: '', type: 'extra_whatsapp_number', price: 500000, duration_days: 30, is_active: 1, unit: '1' })}>
            + New add-on
          </button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Add-on</th>
                <th>Type</th>
                <th>Price</th>
                <th>Duration</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {addons.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.name}</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--muted)' }}>{a.slug}</span>
                    {a.description && <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{a.description}</div>}
                  </td>
                  <td>{a.type.replace(/_/g, ' ')}</td>
                  <td>{naira(a.price)}</td>
                  <td>{a.duration_days > 0 ? `${a.duration_days} days` : '—'}</td>
                  <td>{a.is_active ? '✅' : '⏸️'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="mini-btn" onClick={() => setAddonDraft({ ...a })}>
                        Edit
                      </button>
                      <button className="mini-btn danger" onClick={() => removeAddon(a)} disabled={busy}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addonDraft && (
        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>{addonDraft.id ? 'Edit add-on' : 'New add-on'}</h2>
          <div className="form-row">
            <div className="field">
              <label>Name</label>
              <input className="input" value={addonDraft.name ?? ''} onChange={(e) => setAddonDraft({ ...addonDraft, name: e.target.value })} />
            </div>
            {!addonDraft.id && (
              <>
                <div className="field">
                  <label>Slug</label>
                  <input className="input" value={addonDraft.slug ?? ''} onChange={(e) => setAddonDraft({ ...addonDraft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
                </div>
                <div className="field">
                  <label>Type</label>
                  <select className="select" value={addonDraft.type} onChange={(e) => setAddonDraft({ ...addonDraft, type: e.target.value })}>
                    {ADDON_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          <div className="form-row">
            <div className="field">
              <label>Price (₦)</label>
              <input className="input" type="number" min="1" value={Math.round((addonDraft.price ?? 0) / 100)} onChange={(e) => setAddonDraft({ ...addonDraft, price: (Number(e.target.value) || 0) * 100 })} />
            </div>
            <div className="field">
              <label>Duration (days, 0 = until removed)</label>
              <input className="input" type="number" min="0" value={addonDraft.duration_days ?? 30} onChange={(e) => setAddonDraft({ ...addonDraft, duration_days: Number(e.target.value) || 0 })} />
            </div>
            <div className="field">
              <label>Description</label>
              <input className="input" value={addonDraft.description ?? ''} onChange={(e) => setAddonDraft({ ...addonDraft, description: e.target.value })} />
            </div>
          </div>
          <label style={{ display: 'flex', gap: 8, fontSize: '0.92rem' }}>
            <input type="checkbox" checked={!!addonDraft.is_active} onChange={(e) => setAddonDraft({ ...addonDraft, is_active: e.target.checked ? 1 : 0 })} />
            Active
          </label>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setAddonDraft(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveAddon} disabled={busy}>
              {busy ? 'Saving…' : 'Save add-on'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
