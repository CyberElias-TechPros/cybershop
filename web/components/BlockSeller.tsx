'use client';

import { useState } from 'react';

export default function BlockSeller({ businessId }: { businessId: number }) {
  const [blocked, setBlocked] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <p style={{ marginTop: 8 }}>
      <button
        type="button"
        className="mact"
        onClick={async () => {
          const res = await fetch('/api/account/blocks', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ business_id: businessId }),
          });
          if (res.status === 401) {
            window.location.href = '/login';
            return;
          }
          if (res.ok) {
            setBlocked(true);
            setMsg('Blocked. This store will disappear from your browse.');
          }
        }}
      >
        {blocked ? 'Seller blocked' : 'Block this seller'}
      </button>
      {msg && <span role="status" style={{ marginLeft: 8, color: 'var(--muted)', fontSize: '0.85rem' }}>{msg}</span>}
    </p>
  );
}
