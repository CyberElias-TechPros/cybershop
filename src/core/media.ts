/**
 * Media service — BUILD_PLAN.md §7. The rest of the app never touches a disk, a bucket
 * or an SFTP client; it talks to this interface (plan.md 11). Drivers: local (dev),
 * gateway (production: signed PHP script on the shared host), sftp (fallback).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { hmac, uuidv7 } from "@/lib/util";

export type UploadRequest = {
  businessId: string;
  entityKind: string;
  /** e.g. "catalogue/products" -> vendors/{businessId}/catalogue/products/{itemId} */
  folder: string;
  originalName: string;
  bytes: number;
  declaredMime: string;
  visibility: "public" | "private";
  maxBytes: number;
  allowedMime: readonly string[];
};

export type Ticket = { id: string; url: string; headers: Record<string, string>; expiresAt: number; storageKey: string };

export type StoredMedia = {
  storageKey: string;
  publicUrl: string | null;
  byteSize: number;
  width: number | null;
  height: number | null;
  checksum: string;
  mimeType: string;
  extension: string;
  variants: Record<string, string>;
};

export interface MediaDriver {
  name: string;
  createUploadTicket(req: UploadRequest): Promise<Ticket>;
  /** driver-side verification of what actually landed */
  commit(ticket: Ticket, bytes: Buffer): Promise<StoredMedia>;
  delete(storageKey: string, visibility: "public" | "private"): Promise<void>;
  getUrl(media: { publicUrl: string | null; storageKey: string; visibility: "public" | "private" }, opts?: { ttlSeconds?: number }): Promise<string | null>;
  exists(storageKey: string): Promise<boolean>;
}

/* ------------------------------ shared validation (plan.md 13, 10.3) ------------------------------ */
export const MIME_SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  "image/gif": (b) => ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("ascii")),
  "image/svg+xml": (b) => {
    const s = b.subarray(0, 512).toString("utf8").toLowerCase();
    // svg is XML: refuse anything with script/foreignObject/event handlers (stored-XSS vector)
    return s.includes("<svg") && !/<(script|foreignobject|animate)/.test(s) && !/\son[a-z]+\s*=/.test(s);
  },
  "video/mp4": (b) => b.subarray(4, 8).toString("ascii") === "ftyp",
  "application/pdf": (b) => b.subarray(0, 5).toString("ascii") === "%PDF-",
};

export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/svg+xml": "svg", "video/mp4": "mp4", "application/pdf": "pdf",
};

export const PUBLIC_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const PRIVATE_DOC_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const VIDEO_MIME = ["video/mp4"] as const;

/** Extension, declared MIME, and real bytes must agree; the filename is never trusted. */
export function validateUpload(req: UploadRequest, bytes: Buffer): { ok: true; mime: string } | { ok: false; reason: string } {
  if (!bytes.length) return { ok: false, reason: "The file is empty." };
  if (bytes.length > req.maxBytes) {
    return { ok: false, reason: `That file is ${(bytes.length / 1e6).toFixed(1)}MB. The limit here is ${(req.maxBytes / 1e6).toFixed(0)}MB.` };
  }
  const sniffed = Object.entries(MIME_SIGNATURES).find(([, test]) => test(bytes))?.[0];
  if (!sniffed) return { ok: false, reason: "We could not recognise this as a supported image, video or PDF." };
  if (!req.allowedMime.includes(sniffed)) return { ok: false, reason: `${sniffed} is not allowed in this place.` };
  if (req.declaredMime && req.declaredMime !== "application/octet-stream" && req.declaredMime !== sniffed) {
    return { ok: false, reason: "The file type does not match its extension." };
  }
  return { ok: true, mime: sniffed };
}

export function dimsOf(bytes: Buffer, mime: string): { width: number | null; height: number | null } {
  if (mime === "image/png") return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (mime === "image/gif") return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (mime === "image/jpeg") {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1]!;
      const len = bytes.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  if (mime === "image/webp") {
    const fourcc = bytes.subarray(12, 16).toString("ascii");
    if (fourcc === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (fourcc === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return { width: null, height: null };
}

/** randomised key (plan.md 13): never derive the storage path from user input */
export function buildStorageKey(req: UploadRequest, mime: string) {
  const folder = req.folder.replace(/[^a-z0-9/_-]/gi, "").replace(/^\/+|\/+$/g, "");
  const ext = EXT_BY_MIME[mime] ?? "bin";
  const root = req.visibility === "private" ? `private/vendors/${req.businessId}` : `vendors/${req.businessId}`;
  return `${root}/${folder || "misc"}/${uuidv7()}-${mime.split("/")[1]}.${ext}`;
}

/* ------------------------------ local driver (dev) ------------------------------ */
const LOCAL_ROOT = path.join(process.cwd(), ".data", "media");

export const localDriver: MediaDriver = {
  name: "local",
  async createUploadTicket(req) {
    const mime = req.declaredMime;
    return {
      id: uuidv7(),
      url: `/api/media/local-upload`,
      headers: { "x-ticket-folder": req.folder, "x-ticket-visibility": req.visibility, "x-ticket-business": req.businessId, "x-ticket-kind": req.entityKind },
      expiresAt: Date.now() + 15 * 60_000,
      storageKey: buildStorageKey(req, MIME_HINT_EXT[mime] ? mime : "application/octet-stream"),
    };
  },
  async commit(ticket, bytes) {
    const full = path.join(LOCAL_ROOT, ticket.storageKey);
    if (!full.startsWith(LOCAL_ROOT)) throw new Error("path escape refused");   // defence in depth
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    const { width, height } = dimsOf(bytes, sniffMime(bytes));
    return {
      storageKey: ticket.storageKey,
      publicUrl: ticket.storageKey.startsWith("private/") ? null : `${env.mediaBaseUrl}/${ticket.storageKey}`,
      byteSize: bytes.length,
      width, height,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      mimeType: sniffMime(bytes),
      extension: ticket.storageKey.split(".").pop()!,
      variants: {},
    };
  },
  async delete(storageKey) {
    await unlink(path.join(LOCAL_ROOT, storageKey)).catch(() => undefined);
  },
  async getUrl(media) {
    return media.publicUrl ?? `/api/media/local-file?key=${encodeURIComponent(media.storageKey)}`;
  },
  async exists(storageKey) {
    return stat(path.join(LOCAL_ROOT, storageKey)).then(() => true, () => false);
  },
};

const MIME_HINT_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
function sniffMime(b: Buffer) {
  return Object.entries(MIME_SIGNATURES).find(([, t]) => t(b))?.[0] ?? "application/octet-stream";
}

/* ------------------------------ gateway driver (production) ------------------------------ */
/**
 * Talks to docs/media-gateway/gateway.php on the shared host. Two-phase so the file body
 * goes browser -> host and never traverses a Vercel function (BUILD_PLAN 7.2):
 *   1. app asks the gateway for a ticket (HMAC-signed)
 *   2. browser PUTs bytes to the gateway with the ticket
 *   3. app calls commit(ticket) to verify the manifest and learn the final URL
 */
export const gatewayDriver: MediaDriver = {
  name: "gateway",
  async createUploadTicket(req) {
    const secret = env.MEDIA_GATEWAY_SECRET!;
    const expires = Math.floor(Date.now() / 1000) + 900;
    const canonical = `v1|${req.businessId}|${req.folder}|${req.visibility}|${req.maxBytes}|${req.allowedMime.join(",")}|${expires}`;
    const sig = hmac(secret, canonical);
    const res = await fetch(`${env.MEDIA_GATEWAY_URL}?op=ticket`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": sig, "x-expires": String(expires) },
      body: JSON.stringify({ businessId: req.businessId, folder: req.folder, visibility: req.visibility, maxBytes: req.maxBytes, allowedMime: [...req.allowedMime], expires }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`media gateway ticket failed (${res.status})`);
    const json = (await res.json()) as { ticket: string; uploadUrl: string; storageKey: string };
    return { id: json.ticket, url: json.uploadUrl, headers: {}, expiresAt: expires * 1000, storageKey: json.storageKey };
  },
  async commit(ticket) {
    const res = await fetch(`${env.MEDIA_GATEWAY_URL}?op=commit`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": hmac(env.MEDIA_GATEWAY_SECRET!, `commit|${ticket.id}`) },
      body: JSON.stringify({ ticket: ticket.id }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("media commit failed");
    const m = (await res.json()) as StoredMedia;
    return m;
  },
  async delete(storageKey, visibility) {
    const res = await fetch(`${env.MEDIA_GATEWAY_URL}?op=delete`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": hmac(env.MEDIA_GATEWAY_SECRET!, `del|${storageKey}|${visibility}`) },
      body: JSON.stringify({ key: storageKey, visibility }),
      cache: "no-store",
    });
    if (!res.ok && res.status !== 404) throw new Error("media delete failed");
  },
  async getUrl(media, opts) {
    if (media.publicUrl) return media.publicUrl;
    if (media.visibility === "private") {
      const exp = Math.floor(Date.now() / 1000) + (opts?.ttlSeconds ?? 300);
      const sig = hmac(env.MEDIA_GATEWAY_SECRET!, `fetch|${media.storageKey}|${exp}`);
      return `${env.MEDIA_GATEWAY_URL}?op=fetch&key=${encodeURIComponent(media.storageKey)}&exp=${exp}&sig=${sig}`;
    }
    return `${env.MEDIA_PUBLIC_BASE_URL}/${media.storageKey}`;
  },
  async exists(storageKey) {
    const res = await fetch(`${env.MEDIA_GATEWAY_URL}?op=exists`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": hmac(env.MEDIA_GATEWAY_SECRET!, `ex|${storageKey}`) },
      body: JSON.stringify({ key: storageKey }),
      cache: "no-store",
    });
    return res.ok;
  },
};

export const mediaDriver: MediaDriver =
  env.MEDIA_DRIVER === "gateway" && env.MEDIA_GATEWAY_URL && env.MEDIA_GATEWAY_SECRET ? gatewayDriver : localDriver;

/* ------------------------------ app-level helpers ------------------------------ */
export async function uploadViaDriver(req: UploadRequest, bytes: Buffer) {
  const v = validateUpload(req, bytes);
  if (!v.ok) return { ok: false as const, reason: v.reason };
  const ticket = await mediaDriver.createUploadTicket({ ...req, declaredMime: v.mime });
  // local driver writes through the dev route; gateway expects the browser to PUT.
  const stored = await mediaDriver.commit(ticket, bytes);
  return { ok: true as const, stored };
}

export function checksumOf(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** best-effort client parity helper used by the uploader (documented in plan 7.2) */
export const estimateFromParts = (parts: number[]) => sha256ish(parts.join("|"));
function sha256ish(s: string) { return createHash("sha256").update(s).digest("hex").slice(0, 16); }
export async function readLocalMedia(key: string) {
  const full = path.join(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT)) throw new Error("path escape refused");
  return readFile(full).catch(() => null);
}
export async function localMediaMeta(key: string) {
  try { return await stat(path.join(LOCAL_ROOT, key)); } catch { return null; }
}
