'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface Props {
  businessName: string;
  unread: number;
  isAdmin?: boolean;
}

interface NavLink {
  href: string;
  icon: string;
  label: string;
  /** Shown in the collapsed phone nav (the sections used every day). */
  primary?: boolean;
}

const VENDOR_LINKS: NavLink[] = [
  { href: '/dashboard', icon: '📊', label: 'Overview', primary: true },
  { href: '/dashboard/analytics', icon: '📈', label: 'Analytics', primary: true },
  { href: '/dashboard/catalog', icon: '🏷️', label: 'Catalogue', primary: true },
  { href: '/dashboard/leads', icon: '💬', label: 'Leads', primary: true },
  { href: '/dashboard/inbox', icon: '📥', label: 'Inbox', primary: true },
  { href: '/dashboard/media', icon: '🖼️', label: 'Media', primary: true },
  { href: '/dashboard/offers', icon: '🎁', label: 'Offers' },
  { href: '/dashboard/reviews', icon: '★', label: 'Reviews' },
  { href: '/dashboard/deposits', icon: '🔒', label: 'Deposits' },
  { href: '/dashboard/verification', icon: '🪪', label: 'Verification' },
  { href: '/dashboard/whatsapp', icon: '📱', label: 'WhatsApp' },
  { href: '/dashboard/templates', icon: '✉️', label: 'Templates' },
  { href: '/dashboard/team', icon: '👥', label: 'Team' },
  { href: '/dashboard/domain', icon: '🌐', label: 'Domain' },
  { href: '/dashboard/billing', icon: '💳', label: 'Plan & Billing' },
  { href: '/dashboard/settings', icon: '⚙️', label: 'Settings' },
  { href: '/account/security', icon: '🔐', label: 'Security' },
];

const ADMIN_LINKS: NavLink[] = [
  { href: '/admin', icon: '📊', label: 'Overview', primary: true },
  { href: '/admin/vendors', icon: '🏢', label: 'Vendors', primary: true },
  { href: '/admin/payments', icon: '💳', label: 'Payments', primary: true },
  { href: '/admin/reconciliation', icon: '🧾', label: 'Reconciliation' },
  { href: '/admin/listings', icon: '🏷️', label: 'Listings', primary: true },
  { href: '/admin/reports', icon: '🚩', label: 'Reports', primary: true },
  { href: '/admin/users', icon: '👥', label: 'Users' },
  { href: '/admin/categories', icon: '🗂️', label: 'Categories' },
  { href: '/admin/plans', icon: '🧩', label: 'Plans & Add-ons' },
  { href: '/admin/subscriptions', icon: '📅', label: 'Subscriptions' },
  { href: '/admin/reviews', icon: '★', label: 'Reviews' },
  { href: '/admin/domains', icon: '🌐', label: 'Domains' },
  { href: '/admin/verifications', icon: '🪪', label: 'Verified ID' },
  { href: '/admin/audit', icon: '📜', label: 'Audit log' },
  { href: '/admin/health', icon: '🩺', label: 'Health' },
  { href: '/admin/templates', icon: '✉️', label: 'WA templates' },
  { href: '/admin/settings', icon: '⚙️', label: 'Settings' },
  { href: '/account/security', icon: '🔐', label: 'My security' },
];

/**
 * Workbench navigation.
 *
 * The desktop shell is a plain sidebar. On a phone, fifteen links in a
 * one-line horizontal scroller hid most of the workbench — you had to know a
 * page existed and then swipe to find it. Below the shell breakpoint the links
 * become chips that wrap: the five primary sections are always visible, and
 * "More" reveals the rest in place.
 */
export default function DashNav({ businessName, unread, isAdmin }: Props) {
  const pathname = usePathname();
  const links = isAdmin ? ADMIN_LINKS : VENDOR_LINKS;
  const [expanded, setExpanded] = useState(false);
  const active = (href: string) => (href === '/dashboard' || href === '/admin' ? pathname === href : pathname.startsWith(href));
  // The hidden section must never swallow the page the vendor is looking at.
  const hiddenActive = links.some((l) => !l.primary && active(l.href));

  return (
    <nav className={`dash-nav${expanded ? ' is-expanded' : ''}`} aria-label="Dashboard">
      {!isAdmin && (
        <Link className="nav-brand" href="/dashboard">
          {businessName || 'My Store'}
        </Link>
      )}
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`${active(l.href) ? 'active' : ''}${l.primary ? '' : ' nav-more-item'}`}
          aria-current={active(l.href) ? 'page' : undefined}
        >
          <span aria-hidden>{l.icon}</span>
          {l.label}
          {l.href === '/dashboard/leads' && unread > 0 && <span className="badge-count">{unread}</span>}
        </Link>
      ))}
      {!isAdmin && (
        <Link href="/" className="nav-more-item">
          <span aria-hidden>🌐</span>
          View my store
        </Link>
      )}
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? '▲ Less' : `▼ More${hiddenActive ? ' •' : ''}`}
      </button>
    </nav>
  );
}
