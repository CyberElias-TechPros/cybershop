import { api } from '@/lib/api';
import type { HomeOut } from '@/lib/types';
import { sessionCookieHeader, type Me } from '@/lib/session';
import SearchForm from './SearchForm';
import NavLinks from './NavLinks';
import CategoriesMenu from './CategoriesMenu';
import HeaderCta from './HeaderCta';

export const dynamic = 'force-dynamic';

/** Site header: brand, primary nav, top category links, search. */
export default async function Header() {
  let categories: { name: string; slug: string; icon: string | null }[] = [];
  try {
    const home = await api<HomeOut>('/public/home');
    categories = home.categories;
  } catch {
    /* Worker unreachable — render header without category links */
  }
  const extra = categories.map((c) => ({ href: `/categories/${c.slug}`, label: c.name, icon: c.icon }));
  let me: Me | null = null;
  try {
    me = await api<Me>('/auth/me', { cookie: await sessionCookieHeader() });
  } catch {
    me = null;
  }
  return (
    <header className="site-header">
      <div className="inner">
        <a className="brand" href="/">
          Cyber<span className="dot">Shop</span>
        </a>
        <nav className="main-nav" aria-label="Primary">
          {/* Two navigation levels, kept apart: the market itself, then
              its categories grouped under one button. "Sell" is not here —
              the gold CTA on the right already carries it. */}
          <NavLinks
            links={[
              { href: '/listings', label: 'Shop' },
              { href: '/businesses', label: 'Businesses' },
            ]}
          />
          <CategoriesMenu cats={extra} />
        </nav>
        <div className="header-search">
          <SearchForm />
        </div>
        <HeaderCta extra={extra} me={me ? { role: me.user.role, name: me.user.name, unread: me.unread_notifications } : null} />
      </div>
    </header>
  );
}
