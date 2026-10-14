'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import BusinessSwitcher from './BusinessSwitcher';

interface Props {
  businessName: string;
  unread: number;
  isAdmin?: boolean;
  /** Staff seat (owner/manager see everything). Mirrors worker ROLE_PATHS. */
  memberRole?: string;
}

const ROLE_LINKS: Record<string, string[]> = {
  catalogue: ['/dashboard', '/dashboard/catalog', '/dashboard/media', '/dashboard/offers'],
  sales: ['/dashboard', '/dashboard/leads', '/dashboard/inbox', '/dashboard/deposits', '/dashboard/whatsapp'],
  support: ['/dashboard', '/dashboard/leads', '/dashboard/inbox'],
  accountant: ['/dashboard', '/dashboard/billing'],
};

function visibleForRole(links: NavLink[], role: string | undefined, isAdmin: boolean): NavLink[] {
  if (isAdmin || !role || role === 'owner' || role === 'manager') return links;
  const allowed = ROLE_LINKS[role] ?? ['/dashboard'];
  return links.filter((l) => allowed.some((a) => l.href === a || l.href.startsWith(`${a}/`)) || l.href === '/account/security');
}

interface NavLink {
  href: string;
  icon: string;
  label: string;
  /** Sidebar section heading this link belongs to. */
  group: string;
  /** Shown in the collapsed phone nav (the sections used every day). */
  primary?: boolean;
}

/*
 * Grouped by the job, not alphabetically: a vendor thinks "my shop / my
 * customers / my money", an admin thinks "moderation / money / system".
 * The sidebar shows the headings; the phone chip-row hides them (there,
 * the primary/More split is the grouping that fits).
 */
const VENDOR_GROUPS = ['Today', 'Selling', 'Customers', 'Store', 'Account'];
const VENDOR_LINKS: NavLink[] = [
  { href: '/dashboard', icon: '📊', label: 'Overview', group: 'Today', primary: true },
  { href: '/dashboard/analytics', icon: '📈', label: 'Analytics', group: 'Today', primary: true },
  { href: '/dashboard/catalog', icon: '🏷️', label: 'Catalogue', group: 'Selling', primary: true },
  { href: '/dashboard/media', icon: '🖼️', label: 'Media', group: 'Selling', primary: true },
  { href: '/dashboard/offers', icon: '🎁', label: 'Offers', group: 'Selling' },
  { href: '/dashboard/leads', icon: '💬', label: 'Leads', group: 'Customers', primary: true },
  { href: '/dashboard/inbox', icon: '📥', label: 'Inbox', group: 'Customers', primary: true },
  { href: '/dashboard/reviews', icon: '★', label: 'Reviews', group: 'Customers' },
  { href: '/dashboard/deposits', icon: '🔒', label: 'Deposits', group: 'Customers' },
  { href: '/dashboard/whatsapp', icon: '📱', label: 'WhatsApp', group: 'Store' },
  { href: '/dashboard/templates', icon: '✉️', label: 'Templates', group: 'Store' },
  { href: '/dashboard/verification', icon: '🪪', label: 'Verification', group: 'Store' },
  { href: '/dashboard/team', icon: '👥', label: 'Team', group: 'Store' },
  { href: '/dashboard/domain', icon: '🌐', label: 'Domain', group: 'Store' },
  { href: '/dashboard/billing', icon: '💳', label: 'Plan & Billing', group: 'Account' },
  { href: '/dashboard/settings', icon: '⚙️', label: 'Settings', group: 'Account' },
  { href: '/dashboard/api-keys', icon: '🔑', label: 'API keys', group: 'Account' },
  { href: '/help#selling', icon: '❓', label: 'Help & guides', group: 'Account' },
  { href: '/account/security', icon: '🔐', label: 'Security', group: 'Account' },
];

const ADMIN_GROUPS = ['Today', 'Moderation', 'Money', 'System'];
const ADMIN_LINKS: NavLink[] = [
  { href: '/admin', icon: '📊', label: 'Overview', group: 'Today', primary: true },
  { href: '/admin/vendors', icon: '🏢', label: 'Vendors', group: 'Moderation', primary: true },
  { href: '/admin/listings', icon: '🏷️', label: 'Listings', group: 'Moderation', primary: true },
  { href: '/admin/reports', icon: '🚩', label: 'Reports', group: 'Moderation', primary: true },
  { href: '/admin/verifications', icon: '🪪', label: 'Verified ID', group: 'Moderation' },
  { href: '/admin/reviews', icon: '★', label: 'Reviews', group: 'Moderation' },
  { href: '/admin/payments', icon: '💳', label: 'Payments', group: 'Money', primary: true },
  { href: '/admin/reconciliation', icon: '🧾', label: 'Reconciliation', group: 'Money' },
  { href: '/admin/subscriptions', icon: '📅', label: 'Subscriptions', group: 'Money' },
  { href: '/admin/plans', icon: '🧩', label: 'Plans & Add-ons', group: 'Money' },
  { href: '/admin/users', icon: '👥', label: 'Users', group: 'System' },
  { href: '/admin/categories', icon: '🗂️', label: 'Categories', group: 'System' },
  { href: '/admin/domains', icon: '🌐', label: 'Domains', group: 'System' },
  { href: '/admin/templates', icon: '✉️', label: 'WA templates', group: 'System' },
  { href: '/admin/audit', icon: '📜', label: 'Audit log', group: 'System' },
  { href: '/admin/health', icon: '🩺', label: 'Health', group: 'System' },
  { href: '/admin/settings', icon: '⚙️', label: 'Settings', group: 'System' },
  { href: '/admin/support', icon: '🎫', label: 'Support tickets', group: 'System' },
  { href: '/help#admin', icon: '❓', label: 'Help & guides', group: 'System' },
  { href: '/account/security', icon: '🔐', label: 'My security', group: 'System' },
];

/**
 * Workbench navigation.
 *
 * Desktop: a grouped sidebar (headings above). Phone: chips that wrap —
 * the five primary sections are always visible and "More" reveals the
 * rest in place, so nothing hides behind a horizontal swipe.
 */
export default function DashNav({ businessName, unread, isAdmin = false, memberRole }: Props) {
  const pathname = usePathname();
  const links = visibleForRole(isAdmin ? ADMIN_LINKS : VENDOR_LINKS, memberRole, isAdmin);
  const groups = isAdmin ? ADMIN_GROUPS : VENDOR_GROUPS;
  const [expanded, setExpanded] = useState(false);
  const active = (href: string) => (href === '/dashboard' || href === '/admin' ? pathname === href : pathname.startsWith(href));
  // The hidden section must never swallow the page the vendor is looking at.
  const hiddenActive = links.some((l) => !l.primary && active(l.href));

  const renderLink = (l: NavLink) => (
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
  );

  return (
    <nav className={`dash-nav${expanded ? ' is-expanded' : ''}`} aria-label="Dashboard">
      {!isAdmin && (
        <>
          <BusinessSwitcher />
          <Link className="nav-brand" href="/dashboard">
            {businessName || 'My Store'}
          </Link>
        </>
      )}
      {groups.map((g) => (
        <div className="dash-nav-group" key={g}>
          <span className="dash-nav-heading" aria-hidden="true">{g}</span>
          {links.filter((l) => l.group === g).map(renderLink)}
        </div>
      ))}
      {!isAdmin && (
        <div className="dash-nav-group">
          <Link href="/" className="nav-more-item">
            <span aria-hidden>🌐</span>
            View my store
          </Link>
        </div>
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
