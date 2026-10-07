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
export async function uploadVendorImage(
  file: File,
  driver: 'd1' | 'gateway'
): Promise<{ id: number; url: string }> {
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
