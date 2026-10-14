import { capi } from './client-api';

/**
 * Vendor image upload, both storage drivers.
 *
 * `d1` (dev/demo, and any deployment without the cPanel gateway): the file goes
 * straight to the Worker, which validates magic bytes + quota.
 * `gateway`: the Worker issues a single-use signed token, the browser POSTs the
 * bytes to the cPanel host, then the Worker finalises the media row.
 *
 * Shared by the media library and the store photo/cover pickers so both stay
 * on the same code path (and the gateway flow cannot rot unnoticed).
 */

/**
 * Downscale oversized photos in the browser (max 1600px, JPEG q0.82).
 * A 4 MB phone photo becomes ~350 KB before upload — cheaper for the
 * seller's data, cheaper for every buyer's data after. Small files,
 * PNGs (logos need their edges) and non-images pass through untouched.
 */
export async function shrinkImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/png' || file.size < 300_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (scale >= 1) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function uploadVendorImage(
  rawFile: File,
  driver: 'd1' | 'gateway'
): Promise<{ id: number; url: string }> {
  const file = await shrinkImageFile(rawFile);
  if (driver === 'd1') {
    const form = new FormData();
    form.append('file', file);
    const r = await capi<{ media: { id: number; url: string } }>('/vendor/media/upload', { method: 'POST', body: form });
    return { id: r.media.id, url: r.media.url };
  }
  const tok = await capi<{ token: string; uploadUrl: string; pathPrefix: string }>('/vendor/media/token', {
    method: 'POST',
    body: JSON.stringify({ kind: 'cover' }),
  });
  const form = new FormData();
  form.append('token', tok.token);
  form.append('key', `${tok.pathPrefix}${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '')}`);
  form.append('file', file);
  const up = await fetch(tok.uploadUrl, { method: 'POST', body: form });
  if (!up.ok) throw new Error('Upload to storage failed.');
  const fj = (await up.json().catch(() => ({}))) as { storage_key?: string };
  const done = await capi<{ media: { id: number; url: string } }>('/vendor/media/finalize', {
    method: 'POST',
    body: JSON.stringify({
      token: tok.token,
      storage_key: fj.storage_key ?? `${tok.pathPrefix}${file.name}`,
      original_name: file.name,
      mime: file.type || 'image/jpeg',
      size: file.size,
    }),
  });
  return { id: done.media.id, url: done.media.url };
}
