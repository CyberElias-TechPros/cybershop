import { api } from '@/lib/api';
import type { HomeOut } from '@/lib/types';
import SearchForm from './SearchForm';
import NavLinks from './NavLinks';

export const dynamic = 'force-dynamic';

/** Site header: brand, primary nav, top category links, search. */
export default async function Header() {
  let categories: { name: string; slug: string; icon: string | null }[] = [];
  try {
    const home = await api<HomeOut>('/public/home');
    categories = home.categories.slice(0, 5);
  } catch {
    /* Worker unreachable — render header without category links */
  }
  return (
    <header className="site-header">
      <div className="inner">
        <a className="brand" href="/">
          Cyber<span className="dot">Shop</span>
        </a>
        <nav className="main-nav" aria-label="Primary">
          <NavLinks
            links={[
              { href: '/businesses', label: 'Businesses' },
              ...categories.map((c) => ({ href: `/categories/${c.slug}`, label: c.name })),
            ]}
          />
        </nav>
        <div className="header-search">
          <SearchForm />
        </div>
      </div>
    </header>
  );
}
