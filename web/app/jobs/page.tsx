import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { ListingsOut } from '@/lib/types';
import ListingCard from '@/components/ListingCard';
import { Reveal } from '@/components/Motion';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Jobs & CVs',
  description: 'Jobs and CVs from vendors who paid for the jobs board. Apply on WhatsApp — CyberShop is not a till.',
  alternates: { canonical: '/jobs' },
  openGraph: { title: 'Jobs & CVs', url: '/jobs' },
};

export default async function JobsPage() {
  const ip = await clientIp();
  let data: ListingsOut = { items: [], total: 0, page: 1, pages: 1 };
  try {
    data = await api<ListingsOut>('/public/listings?category=jobs', { ip });
  } catch {
    /* empty */
  }
  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container">
        <Reveal>
          <div className="section-head">
            <div>
              <span className="eyebrow">Premium board</span>
              <h1>
                Jobs &amp; <em>CVs</em>
              </h1>
            </div>
            <span className="section-count">
              {data.total} listing{data.total === 1 ? '' : 's'}
            </span>
          </div>
        </Reveal>
        <p style={{ color: 'var(--ink-dim)', maxWidth: '52ch' }}>
          Vendors pay for this board. Applying is still WhatsApp — CyberShop never runs payroll or checkout.
        </p>
        {data.items.length === 0 ? (
          <div className="empty">
            <h2>No jobs posted yet</h2>
            <p>
              Sellers enable this with the Jobs &amp; CVs add-on. <a href="/listings">Browse other ads</a>.
            </p>
          </div>
        ) : (
          <div className="grid grid-items">
            {data.items.map((it, i) => (
              <Reveal key={it.id} i={i % 4}>
                <ListingCard it={it} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
