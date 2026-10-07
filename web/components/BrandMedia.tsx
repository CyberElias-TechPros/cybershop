'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';
import { uploadVendorImage } from '@/lib/uploads';
import { initials } from '@/lib/ui';

interface MediaItem {
  id: number;
  url: string;
  original_name: string | null;
  size_bytes: number;
}

interface Props {
  /** 'logo' = the store profile photo shown on the storefront and in the market. */
  field: 'logo' | 'cover';
  businessName: string;
  value: { id: number; url: string; alt?: string } | null;
  driver: 'd1' | 'gateway';
  /** Called after the store branding changes so the page can refresh. */
  onSaved?: () => void;
}

/**
 * Store profile photo / cover picker.
 *
 * A storefront with no photo reads as a stall with no sign — buyers scroll past
 * it. This gives vendors the one control they were missing: upload a new image
 * (or re-use one from their media library) as the store's profile photo or
 * cover, straight from Settings, with a live preview.
 */
export default function BrandMedia({ field, businessName, value, driver, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [picker, setPicker] = useState(false);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLogo = field === 'logo';

  const loadLibrary = useCallback(async () => {
    try {
      const d = await capi<{ media: MediaItem[] }>('/vendor/media');
      setLibrary(d.media ?? []);
    } catch {
      setLibrary([]);
    }
  }, []);

  useEffect(() => {
    if (picker) loadLibrary();
  }, [picker, loadLibrary]);

  async function attach(mediaId: number | null) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await capi('/vendor/business/media', { method: 'POST', body: JSON.stringify({ field, media_id: mediaId }) });
      setNotice(mediaId === null ? (isLogo ? 'Profile photo removed.' : 'Cover removed.') : 'Saved.');
      setPicker(false);
      onSaved?.();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const media = await uploadVendorImage(file, driver);
      await capi('/vendor/business/media', { method: 'POST', body: JSON.stringify({ field, media_id: media.id }) });
      setNotice(isLogo ? 'Profile photo updated.' : 'Cover updated.');
      setPicker(false);
      onSaved?.();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={`brand-media ${field}${isLogo ? '' : ' wide'}`}>
      <div
        className={`brand-media-preview${dragging ? ' is-drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
      >
        {isLogo ? (
          value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="brand-logo-img" src={value.url} alt={value.alt || `${businessName} logo`} />
          ) : (
            <span className="brand-logo-fallback" aria-hidden="true">
              {initials(businessName)}
            </span>
          )
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="brand-cover-img" src={value.url} alt="" />
        ) : (
          <span className="brand-cover-empty" aria-hidden="true">
            ▤
          </span>
        )}
        {busy && <span className="brand-media-busy">Uploading…</span>}
      </div>

      <div className="brand-media-body">
        <h3>{isLogo ? 'Store profile photo' : 'Cover photo'}</h3>
        <p className="hint">
          {isLogo
            ? 'Shown as your store’s face — on the storefront, in the directory and next to every listing. Square images look best.'
            : 'The wide banner across the top of your storefront. A real photo of your shop, class or products works better than a logo.'}
        </p>
        <div className="brand-media-acts">
          <button type="button" className="btn btn-ghost sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {value ? 'Replace' : 'Upload'}
          </button>
          <button type="button" className="btn btn-ghost sm" disabled={busy} onClick={() => setPicker((v) => !v)}>
            {picker ? 'Close' : 'Choose from library'}
          </button>
          {value && (
            <button type="button" className="mini-btn danger" disabled={busy} onClick={() => attach(null)}>
              Remove
            </button>
          )}
        </div>
        {error && <p className="form-msg error">{error}</p>}
        {notice && <p className="form-msg success">{notice}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) upload(e.target.files);
          }}
        />
      </div>

      {picker && (
        <div className="brand-media-picker">
          {library.length === 0 ? (
            <p className="hint">No photos in your library yet — upload one above.</p>
          ) : (
            <div className="picker-grid">
              {library.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`picker-tile${m.id === value?.id ? ' is-current' : ''}`}
                  onClick={() => attach(m.id)}
                  title={m.original_name ?? 'photo'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.original_name ?? 'photo'} loading="lazy" />
                  {m.id === value?.id && <span className="picker-flag">Current</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
