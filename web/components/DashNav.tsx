'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  businessName: string;
  unread: number;
  isAdmin?: boolean;
}

const VENDOR_LINKS = [
  { href: '/dashboard', icon: '📊', label: 'Overview' },
  { href: '/dashboard/catalog', icon: '🏷️', label: 'Catalogue' },
  { href: '/dashboard/media', icon: '🖼️', label: 'Media' },
  { href: '/dashboard/leads', icon: '💬', label: 'Leads' },
  { href: '/dashboard/whatsapp', icon: '📱', label: 'WhatsApp' },
  { href: '/dashboard/billing', icon: '💳', label: 'Plan & Billing' },
  { href: '/dashboard/settings', icon: '⚙️', label: 'Settings' },
];

const ADMIN_LINKS = [
  { href: '/admin', icon: '📊', label: 'Overview' },
  { href: '/admin/vendors', icon: '🏢', label: 'Vendors' },
  { href: '/admin/payments', icon: '💳', label: 'Payments' },
  { href: '/admin/categories', icon: '🗂️', label: 'Categories' },
  { href: '/admin/plans', icon: '🧩', label: 'Plans & Add-ons' },
  { href: '/admin/listings', icon: '🏷️', label: 'Listings' },
  { href: '/admin/reports', icon: '🚩', label: 'Reports' },
  { href: '/admin/audit', icon: '📜', label: 'Audit log' },
  { href: '/admin/settings', icon: '⚙️', label: 'Settings' },
];

export default function DashNav({ businessName, unread, isAdmin }: Props) {
  const pathname = usePathname();
  const links = isAdmin ? ADMIN_LINKS : VENDOR_LINKS;
  return (
    <nav className="dash-nav" aria-label="Dashboard">
      {!isAdmin && (
        <Link className="nav-brand" href="/dashboard">
          {businessName || 'My Store'}
        </Link>
      )}
      {links.map((l) => {
        const active = l.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? 'active' : ''}>
            <span aria-hidden>{l.icon}</span>
            {l.label}
            {l.href === '/dashboard/leads' && unread > 0 && <span className="badge-count">{unread}</span>}
          </Link>
        );
      })}
      {!isAdmin && (
        <Link href="/" className="" style={{ marginTop: 10 }}>
          <span aria-hidden>🌐</span>
          View my store
        </Link>
      )}
    </nav>
  );
}
