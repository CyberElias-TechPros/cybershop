'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError, fmtBytes } from '@/lib/client-api';

interface MediaItem {
  id: number;
  url: string;
  original_name: string | null;
  size_bytes: number;
  created_at: string;
  entity_type: string | null;
}

export default function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [driver, setDriver] = useState<'d1' | 'gateway'>('d1');
  const [usage, setUsage] = useState<{ used_bytes: number; limit_mb: number; pct: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ media: MediaItem[]; driver: 'd1' | 'gateway'; usage: { used_bytes: number; limit_mb: number; pct: number } }>('/vendor/media');
      setItems(d.media);
      setDriver(d.driver);
      setUsage(d.usage);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      setBusy(true);
      setError('');
      setNotice('');
      try {
        if (driver === 'd1') {
          const form = new FormData();
          form.append('file', file);
          await capi('/vendor/media/upload', { method: 'POST', body: form });
        } else {
          const tok = await capi<{ token: string; uploadUrl: string; pathPrefix: string }>('/vendor/media/token', {
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
          await capi('/vendor/media/finalize', {
            method: 'POST',
            body: JSON.stringify({
              token: tok.token,
              storage_key: fj.storage_key ?? `${tok.pathPrefix}${file.name}`,
              original_name: file.name,
              mime: file.type || 'image/jpeg',
              size: file.size,
            }),
          });
        }
        setNotice(`Uploaded ${file.name}`);
      } catch (e) {
        setError(extractError(e));
      }
    }
    setBusy(false);
    await load();
  }

  async function remove(id: number) {
    if (!confirm('Remove this photo? It will be detached from any listings using it.')) return;
    setBusy(true);
    try {
      const r = await capi<{ message?: string }>(`/vendor/media/${id}`, { method: 'DELETE' });
      setNotice(r.message ?? 'Photo removed.');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function setBrand(field: 'logo' | 'cover', mediaId: number) {
    setBusy(true);
    setError('');
    try {
      await capi('/vendor/business/media', { method: 'POST', body: JSON.stringify({ field, media_id: mediaId }) });
      setNotice(field === 'logo' ? 'Logo updated.' : 'Cover updated.');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
      await load();
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Media library</h1>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}
      {usage && (
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: -10, marginBottom: 16 }}>
          {fmtBytes(usage.used_bytes)} of {usage.limit_mb} MB used ({usage.pct}%)
        </p>
      )}

      <label
        className="drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        style={{ display: 'block', marginBottom: 20 }}
      >
        {busy ? 'Uploading…' : 'Drop images here, or click to choose files'}
        <div className="hint" style={{ marginTop: 6 }}>
          JPG, PNG or WEBP · max 8MB each · {driver === 'd1' ? 'stored in demo storage' : 'stored on your cPanel host'}
        </div>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) upload(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {items.length === 0 ? (
        <div className="empty">
          <h2>No photos yet</h2>
          <p>Upload photos to use as your logo, cover, or listing images.</p>
        </div>
      ) : (
        <div className="media-grid">
          {items.map((m) => (
            <div key={m.id} className="media-item card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.original_name ?? 'photo'} loading="lazy" />
              <div className="acts">
                {m.entity_type !== 'business' && (
                  <>
                    <button className="mini-btn" title="Set as logo" onClick={() => setBrand('logo', m.id)}>
                      Logo
                    </button>
                    <button className="mini-btn" title="Set as cover" onClick={() => setBrand('cover', m.id)}>
                      Cover
                    </button>
                  </>
                )}
                <button className="mini-btn danger" title="Delete" onClick={() => remove(m.id)}>
                  ✕
                </button>
              </div>
              <div className="meta">
                {m.original_name ?? 'photo'} · {fmtBytes(m.size_bytes)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
