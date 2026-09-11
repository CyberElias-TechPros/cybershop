import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from './api';
import { clientIp } from './ip';

/** Full `Cookie` header value for the current session, or null (for server→Worker calls). */
export async function sessionCookieHeader(): Promise<string | null> {
  const v = (await cookies()).get('cs_session')?.value;
  return v ? `cs_session=${v}` : null;
}

export interface Me {
  user: { id: number; role: 'vendor' | 'admin' | 'buyer'; name: string; email: string };
  business: {
    id: number;
    name: string;
    slug: string;
    status: string;
    about: string | null;
    city: string | null;
    state_region: string | null;
    plan_name: string | null;
    sub_status: string | null;
    expires_at: string | null;
  } | null;
  unread_notifications: number;
}

/** Server-side guard: require an authenticated vendor; redirects otherwise. */
export async function requireVendor(): Promise<Me> {
  const cookieStore = await cookies();
  const me = await fetchMe(cookieStore.get('cs_session')?.value ?? null);
  if (!me) redirect('/login');
  if (me.user.role === 'admin') redirect('/admin');
  if (me.user.role !== 'vendor') redirect('/login');
  return me;
}

/** Server-side guard for the admin area. */
export async function requireAdmin(): Promise<Me> {
  const cookieStore = await cookies();
  const me = await fetchMe(cookieStore.get('cs_session')?.value ?? null);
  if (!me) redirect('/login');
  if (me.user.role !== 'admin') redirect(me.user.role === 'vendor' ? '/dashboard' : '/login');
  return me;
}

async function fetchMe(sessionValue: string | null): Promise<Me | null> {
  try {
    // The Cookie header needs name=value, not just the value.
    const cookieHeader = sessionValue ? `cs_session=${sessionValue}` : null;
    return await api<Me>('/auth/me', { cookie: cookieHeader, ip: await clientIp() });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}
