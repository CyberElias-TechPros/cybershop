'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/saved', label: 'Saved' },
  { href: '/account/enquiries', label: 'Enquiries' },
  { href: '/account/messages', label: 'Messages' },
  { href: '/account/alerts', label: 'Alerts' },
  { href: '/account/settings', label: 'Settings' },
];

export default function AccountNav({
  name,
  role,
  unread,
}: {
  name: string;
  role: string;
  unread: number;
}) {
  const pathname = usePathname();
  return (
    <nav className="dash-nav" aria-label="Account">
      <span className="nav-brand">{name}</span>
      {LINKS.map((l) => {
        const active = l.href === '/account' ? pathname === '/account' : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? 'active' : ''}>
            {l.label}
            {l.href === '/account/alerts' && unread > 0 ? <span className="badge-count">{unread}</span> : null}
          </Link>
        );
      })}
      {role === 'vendor' && <Link href="/dashboard">Vendor dashboard</Link>}
      {role === 'admin' && <Link href="/admin">Admin</Link>}
      <Link href="/listings">Back to the market</Link>
    </nav>
  );
}
