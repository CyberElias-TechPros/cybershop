'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  field_schema: string;
  is_active: number;
  sort_order: number;
}
interface SchemaField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  order?: number;
}

const FIELD_TYPES = ['text', 'long_text', 'number', 'currency', 'boolean', 'date', 'time', 'select', 'multi_select', 'radio', 'checkbox', 'url', 'email', 'phone', 'location', 'rich_text'];
const OPTION_TYPES = new Set(['select', 'multi_select', 'radio', 'checkbox']);

interface Draft {
  id?: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
  fields: SchemaField[];
}

const emptyDraft: Draft = { name: '', slug: '', description: '', icon: '🏷️', is_active: true, sort_order: 0, fields: [] };

export default function AdminCategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ categories: Category[] }>('/admin/categories');
      setCats(d.categories);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditing({ ...emptyDraft, fields: [] });
  }
  function startEdit(c: Category) {
    let fields: SchemaField[] = [];
    try {
      fields = JSON.parse(c.field_schema || '[]');
    } catch {
      fields = [];
    }
    setEditing({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? '',
      icon: c.icon ?? '🏷️',
      is_active: !!c.is_active,
      sort_order: c.sort_order,
      fields,
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.name || !editing.slug) {
      setError('Name and slug are required.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const id = editing.id;
      if (id) {
        await capi(`/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify({ ...editing, field_schema: editing.fields }) });
        setNotice('Category updated.');
      } else {
        await capi('/admin/categories', { method: 'POST', body: JSON.stringify({ ...editing, field_schema: editing.fields }) });
        setNotice('Category created.');
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Category) {
    if (!confirm(`Delete "${c.name}"? Fails if any items still use it.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/categories/${c.id}`, { method: 'DELETE' });
      setNotice('Category deleted.');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  function setField(i: number, patch: Partial<SchemaField>) {
    setEditing((d) => (d ? { ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) } : d));
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Categories</h1>
        <button className="btn btn-primary" onClick={startNew}>
          + New category
        </button>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      {cats.length === 0 ? (
        <div className="empty">
          <h2>No categories yet</h2>
          <p>Create the industries vendors can join — each can carry its own extra fields (e.g. “Duration” for courses).</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Category</th>
                <th>Slug</th>
                <th>Fields</th>
                <th>Active</th>
                <th>Sort</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => {
                let n = 0;
                try {
                  n = (JSON.parse(c.field_schema || '[]') as unknown[]).length;
                } catch {
                  n = 0;
                }
                return (
                  <tr key={c.id}>
                    <td>
                      {c.icon ? `${c.icon} ` : ''}
                      <strong>{c.name}</strong>
                      {c.description && <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{c.description}</div>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{c.slug}</td>
                    <td>{n}</td>
                    <td>{c.is_active ? '✅' : '⏸️'}</td>
                    <td>{c.sort_order}</td>
                    <td>
                      <div className="row-actions">
                        <button className="mini-btn" onClick={() => startEdit(c)}>
                          Edit
                        </button>
                        <button className="mini-btn danger" onClick={() => remove(c)} disabled={busy}>
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
      )}

      {editing && (
        <div className="card panel" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: '1.05rem' }}>{editing.id ? 'Edit category' : 'New category'}</h2>
          <div className="form-row">
            <div className="field">
              <label>Name</label>
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Tech Academy / Courses" />
            </div>
            <div className="field">
              <label>Slug</label>
              <input className="input" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="academy" />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Icon (emoji)</label>
              <input className="input" value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value.slice(0, 10) })} />
            </div>
            <div className="field">
              <label>Sort order</label>
              <input className="input" type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <input className="input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.92rem', marginBottom: 14 }}>
            <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
            Active (shown to vendors and buyers)
          </label>

          <h3 style={{ fontSize: '0.98rem', margin: '16px 0 8px' }}>Extra fields for this industry</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -4 }}>
            Shown on the vendor’s listing form and on public item pages. New industries need no code changes.
          </p>
          {editing.fields.map((f, i) => (
            <div key={i} className="row-grid row-grid-4">
              <input className="input" placeholder="key (duration)" value={f.key} onChange={(e) => setField(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
              <input className="input" placeholder="Label (Duration)" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
              <select className="select" value={f.type} onChange={(e) => setField(i, { type: e.target.value, options: OPTION_TYPES.has(e.target.value) ? f.options ?? [] : undefined })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {OPTION_TYPES.has(f.type) ? (
                <input className="input" placeholder="Options, comma separated" value={(f.options ?? []).join(', ')} onChange={(e) => setField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              ) : (
                <input className="input" placeholder="Placeholder (optional)" value={f.placeholder ?? ''} onChange={(e) => setField(i, { placeholder: e.target.value })} />
              )}
              <div className="row-actions">
                <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                  Required
                </label>
                <button className="mini-btn danger" onClick={() => setEditing({ ...editing, fields: editing.fields.filter((_, j) => j !== i) })}>
                  ✕ Remove
                </button>
              </div>
            </div>
          ))}
          <button className="mini-btn" onClick={() => setEditing({ ...editing, fields: [...editing.fields, { key: '', label: '', type: 'text', required: false }] })}>
            + Add field
          </button>

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save category'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
