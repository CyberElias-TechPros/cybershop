import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { CategoryPageOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';

export const dynamic = 'force-dynamic';

interface SP {
  slug: string;
}

export async function generateMetadata({ params }: { params: Promise<SP> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await api<CategoryPageOut>(`/public/categories/${slug}`);
    return {
      title: data.category.name,
      description: data.category.description || `Browse ${data.category.name} businesses on CyberShop.`,
      openGraph: { title: data.category.name },
    };
  } catch {
    return { title: 'Category not found' };
  }
}

export default async function CategoryPage({ params }: { params: Promise<SP> }) {
  const { slug } = await params;
  const data = await api<CategoryPageOut>(`/public/categories/${slug}`, { ip: await clientIp() });

  return (
    <section className="section">
      <div className="container">
        <p style={{ color: 'var(--muted)', margin: '0 0 6px' }}>
          <a href="/">Home</a> / <a href="/businesses">Businesses</a>
        </p>
        <h1>
          {data.category.icon ? `${data.category.icon} ` : ''}
          {data.category.name}
        </h1>
        {data.category.description && <p style={{ color: 'var(--muted)' }}>{data.category.description}</p>}
        {data.businesses.length === 0 ? (
          <div className="empty">
            <h2>No businesses in this category yet</h2>
            <p>Check back soon, or <a href="/businesses">browse all businesses</a>.</p>
          </div>
        ) : (
          <div className="grid grid-biz" style={{ marginTop: 18 }}>
            {data.businesses.map((b) => (
              <BusinessCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
