/**
 * Browser-side API helper. All calls go same-origin to /api/* (the Next.js
 * proxy adds the Worker's internal secret + client IP), so sessions ride on
 * the usual cookies and the Worker is never exposed directly.
 */

export class ClientApiError extends Error {
  constructor(public status: number, public json: unknown) {
    super(ClientApiError.messageOf(json) || `Request failed (${status})`);
  }
  static messageOf(json: unknown): string | null {
    const j = json as { error?: { message?: string }; message?: string } | null;
    return j?.error?.message ?? (typeof j?.message === 'string' ? j.message : null);
  }
}

export function extractError(e: unknown): string {
  if (e instanceof ClientApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

export async function capi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'content-type': 'application/json' }),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.location.href = '/login';
    throw new ClientApiError(401, null);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new ClientApiError(res.status, json);
  return json as T;
}

export function fmtNaira(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined) return '—';
  return `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
