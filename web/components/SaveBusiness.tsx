'use client';

import { useState } from 'react';

export default function SaveBusiness({ businessId }: { businessId: number }) {
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <p style={{ marginTop: 8 }}>
      <button
        type="button"
        className="mact"
        onClick={async () => {
          const res = await fetch('/api/account/businesses', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ business_id: businessId }),
          });
          if (res.status === 401) {
            window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
            return;
          }
          const data = await res.json().catch(() => null);
          if (res.ok) {
            setSaved(!!data?.saved);
            setMsg(data?.saved ? 'Store saved to your account.' : 'Removed from saved stores.');
          }
        }}
      >
        {saved ? 'Store saved' : 'Save this store'}
      </button>
      {msg && <span role="status" style={{ marginLeft: 8, color: 'var(--muted)', fontSize: '0.85rem' }}>{msg}</span>}
    </p>
  );
}
