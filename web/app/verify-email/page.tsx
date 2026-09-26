'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { capi, extractError } from '@/lib/client-api';

function VerifyInner() {
  const token = useSearchParams().get('token') || '';
  const [msg, setMsg] = useState('Confirming…');
  useEffect(() => {
    if (!token) {
      setMsg('Missing confirmation token.');
      return;
    }
    capi<{ message: string }>('/account/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then((r) => setMsg(r.message))
      .catch((e) => setMsg(extractError(e)));
  }, [token]);
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 560 }}>
        <h1>Email confirmation</h1>
        <p role="status">{msg}</p>
        <a href="/account">Back to your account</a>
      </div>
    </section>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<p>Confirming…</p>}>
      <VerifyInner />
    </Suspense>
  );
}
