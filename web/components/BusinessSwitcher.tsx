'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { capi } from '@/lib/client-api';

interface Biz { id: number; name: string; slug: string; role: string }

/** Switch between stores you own or staff (only renders with 2+). */
export default function BusinessSwitcher() {
  const router = useRouter();
  const [biz, setBiz] = useState<Biz[]>([]);
  const [active, setActive] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, me] = await Promise.all([
        capi<{ businesses: Biz[] }>('/vendor/businesses'),
        capi<{ business?: { id: number } }>('/vendor/business'),
      ]);
      setBiz(list.businesses);
      setActive(me.business?.id ?? null);
    } catch { /* single-store users never see this */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (biz.length < 2) return null;

  return (
    <label className="biz-switch">
      <span className="biz-switch-label">Acting on</span>
      <select
        className="select"
        value={active ?? ''}
        aria-label="Switch business"
        onChange={async (e) => {
          const id = Number(e.target.value);
          await capi('/vendor/business/switch', { method: 'POST', body: JSON.stringify({ business_id: id }) }).catch(() => undefined);
          router.refresh();
        }}
      >
        {biz.map((b) => (
          <option key={b.id} value={b.id}>{b.name} ({b.role})</option>
        ))}
      </select>
    </label>
  );
}
