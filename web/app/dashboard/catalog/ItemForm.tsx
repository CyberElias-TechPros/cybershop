'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capi, extractError, fmtNaira } from '@/lib/client-api';
import VoiceRecorder from '@/components/VoiceRecorder';

interface ItemType {
  id: number;
  name: string;
  slug: string;
  url_segment: string;
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
interface BizCategory {
  id: number;
  name: string;
  slug: string;
  field_schema: string;
}
interface MediaItem {
  id: number;
  url: string;
  original_name: string | null;
  size_bytes: number;
}
interface WaNumber {
  id: number;
  number: string;
  label: string;
  is_default: number;
}
interface ExistingItem {
  id: number;
  name: string;
  slug: string;
  status: string;
  item_type_id: number;
  item_type_slug: string;
  category_id: number | null;
  category_slug: string | null;
  description: string | null;
  price: number | null;
  price_type: string;
  stock_status: string;
  featured: number | boolean;
  whatsapp_number_id: number | null;
  seo_title: string | null;
  seo_description: string | null;
  custom_fields: Record<string, unknown>;
  images: { id: number }[];
  audio: { id: number; url: string } | null;
  stats: { views: number; inquiries: number };
  inspection_json?: string | null;
}

const TEXT_TYPES = new Set(['text', 'url', 'email', 'phone', 'location']);
const LONG_TYPES = new Set(['long_text', 'rich_text']);

function humanize(k: string) {
  return k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ItemForm({ itemId }: { itemId?: number }) {
  const router = useRouter();
  const [types, setTypes] = useState<ItemType[]>([]);
  const [cats, setCats] = useState<BizCategory[]>([]);
  const [numbers, setNumbers] = useState<WaNumber[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [driver, setDriver] = useState<'d1' | 'gateway'>('d1');
  const [existing, setExisting] = useState<ExistingItem | null>(null);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [typeSlug, setTypeSlug] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [description, setDescription] = useState('');
  const [priceType, setPriceType] = useState<'fixed' | 'from' | 'negotiable' | 'free'>('fixed');
  const [priceNaira, setPriceNaira] = useState('');
  const [stockStatus, setStockStatus] = useState('n_a');
  const [featured, setFeatured] = useState(false);
  const [waNumberId, setWaNumberId] = useState<number | ''>('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [publish, setPublish] = useState(true);
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [selectedMedia, setSelectedMedia] = useState<number[]>([]);
  const [audio, setAudio] = useState<{ id: number; url: string } | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [featuredSlots, setFeaturedSlots] = useState<{ used: number; limit: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [it, wh, md, prem] = await Promise.all([
        capi<{ types: ItemType[]; categories: BizCategory[] }>('/vendor/item-types'),
        capi<{ numbers: WaNumber[] }>('/vendor/whatsapp'),
        capi<{ media: MediaItem[]; driver: 'd1' | 'gateway' }>('/vendor/media'),
        capi<{ featured: { used: number; limit: number } }>('/vendor/premium').catch(() => null),
      ]);
      if (prem?.featured) setFeaturedSlots(prem.featured);
      setTypes(it.types);
      setCats(it.categories);
      setNumbers(wh.numbers);
      setMedia(md.media);
      setDriver(md.driver);
      if (itemId) {
        const d = await capi<{ item: ExistingItem }>(`/vendor/items/${itemId}`);
        const x = d.item;
        setExisting(x);
        setName(x.name);
        setTypeSlug(x.item_type_slug);
        setCategorySlug(x.category_slug ?? '');
        setDescription(x.description ?? '');
        setPriceType((x.price_type as 'fixed') || 'fixed');
        setPriceNaira(x.price !== null ? String(Math.round(x.price / 100)) : '');
        setStockStatus(x.stock_status);
        setFeatured(!!x.featured);
        setWaNumberId(x.whatsapp_number_id ?? '');
        setSeoTitle(x.seo_title ?? '');
        setSeoDescription(x.seo_description ?? '');
        setPublish(x.status === 'published');
        setCustom(x.custom_fields ?? {});
        setSelectedMedia(x.images.map((i) => i.id));
        setAudio(x.audio ?? null);
        try {
          const insp = x.inspection_json ? (JSON.parse(x.inspection_json) as { notes?: string }) : null;
          setInspectionNotes(insp?.notes ?? '');
        } catch {
          setInspectionNotes('');
        }
      } else {
        setPublish(true);
        setAudio(null);
      }
    } catch (e) {
      setLoadError(extractError(e));
    }
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeCat = useMemo(() => cats.find((c) => c.slug === categorySlug) ?? null, [cats, categorySlug]);
  const schema: SchemaField[] = useMemo(() => {
    if (!activeCat) return [];
    try {
      const s = JSON.parse(activeCat.field_schema || '[]') as SchemaField[];
      return s.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    } catch {
      return [];
    }
  }, [activeCat]);

  async function uploadFile(file: File) {
    setBusy(true);
    setError('');
    try {
      let added: { id: number };
      if (driver === 'd1') {
        const form = new FormData();
        form.append('file', file);
        added = (await capi<{ media: { id: number } }>('/vendor/media/upload', { method: 'POST', body: form })).media;
      } else {
        // gateway flow: token → direct browser upload to cPanel → finalize
        const tok = await capi<{ token: string; uploadUrl: string; pathPrefix: string; maxBytes: number }>('/vendor/media/token', {
          method: 'POST',
          body: JSON.stringify({ kind: 'catalogue' }),
        });
        const form = new FormData();
        form.append('token', tok.token);
        form.append('key', `${tok.pathPrefix}${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '')}`);
        form.append('file', file);
        const up = await fetch(tok.uploadUrl, { method: 'POST', body: form });
        if (!up.ok) throw new Error('Upload to storage failed');
        const fj = await up.json().catch(() => ({}));
        added = (
          await capi<{ media: { id: number } }>('/vendor/media/finalize', {
            method: 'POST',
            body: JSON.stringify({
              token: tok.token,
              storage_key: fj.storage_key ?? `${tok.pathPrefix}${file.name}`,
              original_name: file.name,
              mime: file.type || 'image/jpeg',
              size: file.size,
            }),
          })
        ).media;
      }
      setSelectedMedia((sel) => [...sel, added.id]);
      const md = await capi<{ media: MediaItem[] }>('/vendor/media');
      setMedia(md.media);
      setNotice('Image uploaded.');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save(publishNow: boolean) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const priceKobo = priceNaira.trim() === '' ? null : Math.round(parseFloat(priceNaira) * 100);
      if ((priceType === 'fixed' || priceType === 'from') && priceKobo === null) {
        setError('Enter a price (in naira).');
        setBusy(false);
        return;
      }
      const body = {
        name,
        item_type_slug: typeSlug,
        category_slug: categorySlug || null,
        description: description || null,
        price_kobo: priceKobo,
        price_type: priceType,
        stock_status: stockStatus,
        featured,
        inspection_notes: inspectionNotes || null,
        whatsapp_number_id: waNumberId === '' ? null : waNumberId,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        custom_fields: custom,
        media_ids: selectedMedia,
        audio_media_id: audio?.id ?? null,
        publish: publishNow,
      };
      if (itemId) {
        await capi(`/vendor/items/${itemId}`, { method: 'PUT', body: JSON.stringify(body) });
        router.push('/dashboard/catalog');
        router.refresh();
      } else {
        const r = await capi<{ id: number }>('/vendor/items', { method: 'POST', body: JSON.stringify(body) });
        router.push(`/dashboard/catalog/${r.id}`);
        router.refresh();
      }
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  async function setItemStatus(status: string) {
    if (!itemId) return;
    setBusy(true);
    setError('');
    try {
      await capi(`/vendor/items/${itemId}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      setNotice(status === 'published' ? 'Listing published.' : `Status set to ${status}.`);
      setPublish(status === 'published');
      setExisting((x) => (x ? { ...x, status } : x));
      router.refresh();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!itemId) return;
    setBusy(true);
    try {
      const r = await capi<{ id: number }>(`/vendor/items/${itemId}/duplicate`, { method: 'POST', body: JSON.stringify({}) });
      router.push(`/dashboard/catalog/${r.id}`);
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!itemId) return;
    if (!confirm('Delete this listing? It will be removed from your store (kept as archived).')) return;
    setBusy(true);
    try {
      await capi(`/vendor/items/${itemId}`, { method: 'DELETE' });
      router.push('/dashboard/catalog');
      router.refresh();
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  function setCustomField(key: string, value: unknown) {
    setCustom((c) => ({ ...c, [key]: value }));
  }

  if (loadError) {
    return (
      <div>
        <div className="dash-head">
          <h1>{itemId ? 'Edit listing' : 'New listing'}</h1>
        </div>
        <div className="form-msg error">{loadError}</div>
      </div>
    );
  }
  if (!types.length && !loadError) {
    return (
      <div>
        <div className="dash-head">
          <h1>{itemId ? 'Edit listing' : 'New listing'}</h1>
        </div>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="dash-head">
        <h1>{itemId ? 'Edit listing' : 'New listing'}</h1>
        <div className="row-actions">
          <Link className="mini-btn" href="/dashboard/catalog">
            ← Back
          </Link>
          {existing?.status === 'published' ? (
            <button className="mini-btn" onClick={() => setItemStatus('draft')} disabled={busy}>
              Unpublish
            </button>
          ) : (
            <button className="mini-btn" onClick={() => setItemStatus('published')} disabled={busy}>
              Publish
            </button>
          )}
          {itemId ? (
            <>
              <button className="mini-btn" onClick={duplicate} disabled={busy}>
                Duplicate
              </button>
              <button className="mini-btn danger" onClick={remove} disabled={busy}>
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      <div className="card panel">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" className="input" required minLength={2} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Web Development Course" />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="type">Listing type</label>
            <select id="type" className="select" required value={typeSlug} onChange={(e) => setTypeSlug(e.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {types.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="hint">Sets the WhatsApp message template and page layout.</div>
          </div>
          <div className="field">
            <label htmlFor="cat">Category (adds extra fields)</label>
            <select id="cat" className="select" value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}>
              <option value="">None — basic listing</option>
              {cats.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="desc">Description</label>
          <textarea id="desc" className="textarea" maxLength={20000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it? What do buyers get? Shipping? Guarantees?" />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="pt">Price type</label>
            <select id="pt" className="select" value={priceType} onChange={(e) => setPriceType(e.target.value as 'fixed')}>
              <option value="fixed">Fixed price</option>
              <option value="from">Price from</option>
              <option value="negotiable">Negotiable / on request</option>
              <option value="free">Free</option>
            </select>
          </div>
          {(priceType === 'fixed' || priceType === 'from') && (
            <div className="field">
              <label htmlFor="price">Price (₦)</label>
              <input id="price" className="input" type="number" min="0" step="1" inputMode="numeric" value={priceNaira} onChange={(e) => setPriceNaira(e.target.value)} placeholder="e.g. 450000" />
            </div>
          )}
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="stock">Availability</label>
            <select id="stock" className="select" value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
              <option value="in_stock">In stock</option>
              <option value="out_of_stock">Out of stock</option>
              <option value="made_to_order">Made to order</option>
              <option value="n_a">Not applicable</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="wa">WhatsApp number for this listing</label>
            <select id="wa" className="select" value={waNumberId} onChange={(e) => setWaNumberId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Store default</option>
              {numbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.number}
                  {n.label ? ` — ${n.label}` : ''}
                  {n.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {schema.length > 0 && (
          <>
            <h2 style={{ fontSize: '1rem', margin: '18px 0 10px' }}>Details for {activeCat?.name}</h2>
            {schema.map((f) => {
              const label = f.label || humanize(f.key);
              const req = f.required ? ' (required)' : '';
              if (LONG_TYPES.has(f.type)) {
                return (
                  <div className="field" key={f.key}>
                    <label htmlFor={`f_${f.key}`}>
                      {label}
                      {req}
                    </label>
                    <textarea id={`f_${f.key}`} className="textarea" placeholder={f.placeholder} value={String(custom[f.key] ?? '')} onChange={(e) => setCustomField(f.key, e.target.value)} />
                  </div>
                );
              }
              if (f.type === 'select' || f.type === 'radio') {
                return (
                  <div className="field" key={f.key}>
                    <label htmlFor={`f_${f.key}`}>
                      {label}
                      {req}
                    </label>
                    <select id={`f_${f.key}`} className="select" value={String(custom[f.key] ?? '')} onChange={(e) => setCustomField(f.key, e.target.value)}>
                      <option value="">—</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }
              if (f.type === 'multi_select' || f.type === 'checkbox') {
                const arr = Array.isArray(custom[f.key]) ? (custom[f.key] as string[]) : [];
                return (
                  <div className="field" key={f.key}>
                    <label>
                      {label}
                      {req}
                    </label>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {(f.options ?? []).map((o) => (
                        <label key={o} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.92rem' }}>
                          <input
                            type="checkbox"
                            checked={arr.includes(o)}
                            onChange={(e) => setCustomField(f.key, e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
                          />
                          {o}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              }
              if (f.type === 'boolean') {
                const on = !!custom[f.key];
                return (
                  <div className="field" key={f.key}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} onChange={(e) => setCustomField(f.key, e.target.checked)} />
                      {label}
                    </label>
                  </div>
                );
              }
              if (f.type === 'number' || f.type === 'currency') {
                return (
                  <div className="field" key={f.key}>
                    <label htmlFor={`f_${f.key}`}>
                      {label}
                      {req} {f.type === 'currency' ? '(₦)' : ''}
                    </label>
                    <input
                      id={`f_${f.key}`}
                      className="input"
                      type="number"
                      min="0"
                      value={custom[f.key] === null || custom[f.key] === undefined ? '' : String(custom[f.key])}
                      onChange={(e) => setCustomField(f.key, e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                );
              }
              if (f.type === 'date') {
                return (
                  <div className="field" key={f.key}>
                    <label htmlFor={`f_${f.key}`}>
                      {label}
                      {req}
                    </label>
                    <input id={`f_${f.key}`} className="input" type="date" value={String(custom[f.key] ?? '')} onChange={(e) => setCustomField(f.key, e.target.value)} />
                  </div>
                );
              }
              if (f.type === 'time') {
                return (
                  <div className="field" key={f.key}>
                    <label htmlFor={`f_${f.key}`}>
                      {label}
                      {req}
                    </label>
                    <input id={`f_${f.key}`} className="input" type="time" value={String(custom[f.key] ?? '')} onChange={(e) => setCustomField(f.key, e.target.value)} />
                  </div>
                );
              }
              return (
                <div className="field" key={f.key}>
                  <label htmlFor={`f_${f.key}`}>
                    {label}
                    {req}
                  </label>
                  <input id={`f_${f.key}`} className="input" type={TEXT_TYPES.has(f.type) ? 'text' : 'text'} placeholder={f.placeholder} value={String(custom[f.key] ?? '')} onChange={(e) => setCustomField(f.key, e.target.value)} />
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="card panel">
        <div className="dash-head" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Photos ({selectedMedia.length})</h2>
        </div>
        {media.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 0 }}>No photos in your media library yet.</p>
        ) : (
          <div className="media-grid">
            {media.map((m) => {
              const sel = selectedMedia.includes(m.id);
              return (
                <div key={m.id} className="media-item card" style={{ cursor: 'pointer', borderColor: sel ? 'var(--green)' : undefined }} onClick={() => setSelectedMedia(sel ? selectedMedia.filter((x) => x !== m.id) : [...selectedMedia, m.id])}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.original_name ?? 'photo'} loading="lazy" />
                  {sel && <div className="acts"><span className="mini-btn" style={{ background: 'var(--green)', color: '#fff', border: 0 }}>✓</span></div>}
                  <div className="meta">{Math.round(m.size_bytes / 1024)} KB</div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="mini-btn">
            {busy ? 'Uploading…' : '⬆ Upload new photo'}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
          </label>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>JPG, PNG or WEBP · up to 8MB. Or manage everything on the <Link href="/dashboard/media">Media</Link> page.</span>
        </div>
      </div>

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>Voice note (optional)</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 0, marginBottom: 14 }}>
          Record yourself introducing the item — buyers hear it on the item page, like a WhatsApp
          voice message. Courses and services convert well with a 20–30 second note.
        </p>
        <VoiceRecorder
          value={audio}
          onAttach={(id, url) => {
            setAudio({ id, url });
            setNotice('Voice note attached.');
          }}
          onDetach={() => setAudio(null)}
        />
      </div>

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>Search (optional)</h2>
        <div className="form-row">
          <div className="field">
            <label htmlFor="seot">SEO title</label>
            <input id="seot" className="input" maxLength={200} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="seod">SEO description</label>
            <input id="seod" className="input" maxLength={300} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-actions">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.95rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          Publish immediately
        </label>
        <span className="spacer" />
        {priceType !== 'negotiable' && priceType !== 'free' && priceNaira !== '' && (
          <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{priceType === 'from' ? 'From ' : ''}{fmtNaira(Math.round(parseFloat(priceNaira || '0') * 100))}</span>
        )}
        <button className="btn btn-ghost" onClick={() => save(false)} disabled={busy}>
          {busy ? 'Saving…' : 'Save as draft'}
        </button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={busy}>
          {busy ? 'Saving…' : 'Publish'}
        </button>
      </div>
    </div>
  );
}
