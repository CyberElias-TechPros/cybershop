import type { Env } from '../config';
import { badRequest, quotaExceeded, notFound, forbidden } from './errors';
import { randomToken, nowUnix, nowIso } from './util';
import { hmacHex, verifyHmac } from './crypto';

export interface MediaRow {
  id: number;
  business_id: number | null;
  driver: 'd1' | 'gateway';
  storage_key: string;
  d1_blob?: ArrayBuffer | null;
  original_name: string | null;
  mime_type: string;
  extension: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  checksum: string | null;
  visibility: 'public' | 'private';
  status: string;
  entity_type: string | null;
  entity_id: number | null;
  created_at: string;
}

export const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const AUDIO_MIME = new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav']);
export const PROOF_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/wav': 'wav',
};

export const MIME_EXT = EXT_BY_MIME;

const latin1 = (u: Uint8Array) => Array.from(u, (x) => String.fromCharCode(x)).join('');

export async function magicMime(buf: ArrayBuffer): Promise<string | null> {
  const b = new Uint8Array(buf.slice(0, 16));
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && latin1(b.slice(0, 4)) === 'RIFF') {
    if (latin1(b.slice(8, 12)) === 'WEBP') return 'image/webp';
    if (latin1(b.slice(8, 12)) === 'WAVE') return 'audio/wav';
  }
  if (b.length >= 5 && latin1(b.slice(0, 5)) === '%PDF-') return 'application/pdf';
  // audio
  if (b.length >= 3 && latin1(b.slice(0, 3)) === 'ID3') return 'audio/mpeg';
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (b.length >= 4 && latin1(b.slice(0, 4)) === 'OggS') return 'audio/ogg';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (b.length >= 12 && latin1(b.slice(4, 8)) === 'ftyp') {
    const brand = latin1(b.slice(8, 12));
    if (brand === 'M4A ' || brand === 'M4A2' || brand === 'M4A3' || brand === 'mp4a') return 'audio/mp4';
  }
  return null;
}

const b64ToBytes = (s: string) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export interface IssueTokenResult {
  token: string;
  uploadUrl: string;
  pathPrefix: string;
  maxBytes: number;
}

function base64UrlEncode(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Issue a short-lived, single-use, HMAC-signed upload token for the media gateway.
 * Format: base64url(JSON{t,b,e,m}) . hmacSHA256(GATEWAY_SECRET, payload)
 * The gateway verifies signature/expiry/MIME/size statelessly; the Worker keeps
 * the random `t` part in D1 for single-use + business + quota enforcement.
 */
export async function issueUploadToken(
  env: Env,
  businessId: number,
  opts: { maxBytes: number; entityLabel: string }
): Promise<IssueTokenResult> {
  const t = randomToken(16);
  const expiresAt = nowUnix() + 600; // 10 minutes
  const pathPrefix = `media/vendors/${businessId}/${opts.entityLabel}/`;
  const payloadB64 = base64UrlEncode(JSON.stringify({ t, b: businessId, e: expiresAt, m: opts.maxBytes }));
  const signature = await hmacHex(env.GATEWAY_SECRET, payloadB64);
  const token = `${payloadB64}.${signature}`;
  await env.DB.prepare(
    'INSERT INTO upload_tokens (token, business_id, path_prefix, allowed_mime, max_bytes, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(t, businessId, pathPrefix, 'image', opts.maxBytes, expiresAt).run();
  return {
    token,
    uploadUrl: `${env.GATEWAY_PUBLIC_URL}/upload.php`,
    pathPrefix,
    maxBytes: opts.maxBytes,
  };
}

/**
 * Finalize a gateway upload: validate the token (single-use, not expired, right business),
 * create the media row. The token HMAC is re-verified by the gateway itself.
 */
export async function finalizeGatewayUpload(
  env: Env,
  args: {
    businessId: number;
    token: string;
    storageKey: string;
    originalName?: string;
    mime: string;
    size: number;
    width?: number;
    height?: number;
  }
): Promise<MediaRow> {
  // verify signature + extract the random part tracked in D1
  const [payloadB64, signature] = String(args.token).split('.');
  if (!payloadB64 || !signature) throw badRequest('Invalid upload token.');
  const sigOk = await verifyHmac(env.GATEWAY_SECRET, payloadB64, signature);
  if (!sigOk) throw forbidden('Invalid upload token.');
  let randomPart: string;
  try {
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    randomPart = String(payload.t || '');
  } catch {
    throw badRequest('Invalid upload token.');
  }
  const tok = (await env.DB.prepare('SELECT * FROM upload_tokens WHERE token = ?').bind(randomPart).first()) as UploadToken | null;
  if (!tok || tok.used_at || tok.expires_at < nowUnix()) throw badRequest('Upload session expired. Please try uploading again.');
  if (tok.business_id !== args.businessId) throw forbidden('Upload token does not match.');
  if (!IMAGE_MIME.has(args.mime)) throw badRequest('File type not allowed.');
  if (args.size > tok.max_bytes) throw quotaExceeded('File is larger than the allowed size for your plan.');
  if (!tok.path_prefix || !args.storageKey.startsWith(tok.path_prefix)) {
    throw badRequest('Storage path is invalid.');
  }
  // path traversal guard: no '..' segments
  if (args.storageKey.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) {
    throw badRequest('Storage path is invalid.');
  }
  // Atomic single-use claim: the token column stores the 16-char random part,
  // and the WHERE used_at IS NULL guard makes concurrent replays lose the race.
  const claim = await env.DB.prepare(
    'UPDATE upload_tokens SET used_at = ? WHERE token = ? AND used_at IS NULL'
  ).bind(nowUnix(), randomPart).run();
  if (!claim.meta.changes) throw badRequest('Upload session expired. Please try uploading again.');

  const res = await env.DB.prepare(
    `INSERT INTO media (business_id, driver, storage_key, original_name, mime_type, extension, kind, size_bytes, width, height, visibility, status)
     VALUES (?, 'gateway', ?, ?, ?, ?, 'image', ?, ?, ?, 'public', 'uploaded')`
  ).bind(
    args.businessId,
    args.storageKey,
    args.originalName || null,
    args.mime,
    EXT_BY_MIME[args.mime] || 'bin',
    args.size,
    args.width || null,
    args.height || null
  ).run();
  return (await env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(Number(res.meta.last_row_id)).first()) as MediaRow;
}

interface UploadToken {
  token: string;
  business_id: number;
  path_prefix: string;
  allowed_mime: string;
  max_bytes: number;
  expires_at: number;
  used_at: number | null;
}

/** Store a blob directly in D1 (private files like payment proofs; dev-mode media). */
export async function storeD1Media(
  env: Env,
  args: {
    businessId: number | null;
    userId?: number;
    blob: ArrayBuffer;
    mime: string;
    originalName?: string;
    visibility?: 'public' | 'private';
    kind?: 'image' | 'video' | 'audio' | 'document';
    width?: number;
    height?: number;
  }
): Promise<MediaRow> {
  const kind =
    args.kind ??
    (args.mime.startsWith('image/') ? 'image' : args.mime.startsWith('audio/') ? 'audio' : 'document');
  const storageKey = `d1/${kind}/${randomToken(16)}.${EXT_BY_MIME[args.mime] || 'bin'}`;
  const res = await env.DB.prepare(
    `INSERT INTO media (business_id, uploaded_by, driver, storage_key, d1_blob, original_name, mime_type, extension, kind, size_bytes, width, height, visibility, status)
     VALUES (?, ?, 'd1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded')`
  ).bind(
    args.businessId,
    args.userId ?? null,
    storageKey,
    args.blob,
    args.originalName || null,
    args.mime,
    EXT_BY_MIME[args.mime] || 'bin',
    kind,
    args.blob.byteLength,
    args.width || null,
    args.height || null,
    args.visibility || 'public'
  ).run();
  return (await env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(Number(res.meta.last_row_id)).first()) as MediaRow;
}

/**
 * Normalize a D1 BLOB value to an ArrayBuffer before handing it to a
 * Response. The production driver returns ArrayBuffer; the local dev driver
 * can return a plain number array, which `new Response(array)` would silently
 * stringify into "255,216,…" text — corrupting every served file.
 */
export function blobToBuffer(v: ArrayBuffer | Uint8Array | number[] | string | null | undefined): ArrayBuffer {
  if (v == null) return new ArrayBuffer(0);
  if (v instanceof ArrayBuffer) return v;
  if (ArrayBuffer.isView(v)) {
    const u = v as Uint8Array;
    return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  }
  if (Array.isArray(v)) return Uint8Array.from(v as number[]).buffer;
  const s = String(v);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
  return u.buffer;
}

/** Public URL for a media row (used in <img>, OG tags, WhatsApp messages).
 *
 * The D1 branch is RELATIVE on purpose: the Worker is never exposed directly
 * (the web app proxies /api/* same-origin), so a relative path survives any
 * deployment/preview origin. Consumers that need an absolute URL (OG tags,
 * JSON-LD) run it through absUrl(). The gateway branch is a real third-party
 * host and must stay absolute. */
export function mediaUrl(env: Env, row: Pick<MediaRow, 'driver' | 'storage_key' | 'id'>): string {
  if (row.driver === 'gateway') return `${env.MEDIA_BASE_URL}/${row.storage_key}`;
  return `/api/media/file/${row.id}`;
}

export async function getMedia(env: Env, id: number): Promise<MediaRow | null> {
  return (await env.DB.prepare('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL').bind(id).first()) as MediaRow | null;
}

export async function assertMediaOwnership(env: Env, mediaId: number, businessId: number): Promise<MediaRow> {
  const row = await getMedia(env, mediaId);
  if (!row || row.business_id !== businessId) throw notFound('Media not found.');
  return row;
}

export async function markMediaAttached(env: Env, ids: number[]): Promise<void> {
  for (const id of ids) {
    await env.DB.prepare(`UPDATE media SET status = 'attached' WHERE id = ? AND status IN ('uploaded','unused','orphaned')`).bind(id).run();
  }
}

/** Detach a media row from entities; becomes unused (orphan cleanup later). */
export async function detachMedia(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`UPDATE media SET entity_type = NULL, entity_id = NULL, status = 'unused' WHERE id = ?`).bind(id).run();
}

export async function softDeleteMedia(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`UPDATE media SET status = 'deleted', deleted_at = ?, d1_blob = NULL WHERE id = ?`).bind(nowIso(), id).run();
}

export async function storageUsedBytes(env: Env, businessId: number): Promise<number> {
  const row = (await env.DB.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) AS used FROM media
     WHERE business_id = ? AND status != 'deleted' AND deleted_at IS NULL`
  ).bind(businessId).first()) as { used: number };
  return row.used;
}
