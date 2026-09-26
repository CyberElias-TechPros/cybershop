'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

export default function AccountHome() {
  const [data, setData] = useState<{
    user: { name: string; email: string; role: string; email_verified: boolean };
    counts: { favorites: number; inquiries: number; threads: number; saved_searches: number; saved_businesses: number; unread: number };
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    capi<NonNullable<typeof data>>('/account/home')
      .then(setData)
      .catch((e) => setError(extractError(e)));
  }, []);

  if (error) return <div className="form-msg error">{error}</div>;
  if (!data) return <p>Loading your account…</p>;

  const cards = [
    ['Saved ads', data.counts.favorites, '/account/saved'],
    ['Saved stores', data.counts.saved_businesses, '/account/saved'],
    ['Enquiries', data.counts.inquiries, '/account/enquiries'],
    ['Messages', data.counts.threads, '/account/messages'],
    ['Saved searches', data.counts.saved_searches, '/account/alerts'],
    ['Alerts', data.counts.unread, '/account/alerts'],
  ] as const;

  return (
    <div>
      <div className="dash-head">
        <h1>Hello, {data.user.name.split(' ')[0]}</h1>
      </div>
      <p style={{ color: 'var(--muted)', maxWidth: '58ch' }}>
        This is your buyer desk. Browsing stays free. WhatsApp is still how you talk to a seller — CyberShop never checks you out.
      </p>
      {!data.user.email_verified && (
        <div className="banner warn" style={{ margin: '12px 0' }}>
          <div>
            Email not confirmed yet. <Link href="/account/settings">Send a confirmation link</Link> so password resets and search alerts reach you.
          </div>
        </div>
      )}
      <div className="stat-grid" style={{ marginTop: 18 }}>
        {cards.map(([label, n, href]) => (
          <Link key={label} href={href} className="card panel" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="num">{n}</div>
            <div style={{ color: 'var(--muted)' }}>{label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
