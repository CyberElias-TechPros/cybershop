import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { CategoryPageOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import { Reveal } from '@/components/Motion';

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
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container">
        <Reveal>
          <nav className="crumb" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span aria-hidden>/</span>
            <a href="/businesses">Businesses</a>
            <span aria-hidden>/</span>
            <span>{data.category.name}</span>
          </nav>
        </Reveal>
        <Reveal i={1}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, margin: '22px 0 8px' }}>
            <span
              aria-hidden
              style={{
                fontSize: '2.6rem',
                width: 88,
                height: 88,
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 26,
                background: 'rgba(44,229,142,0.07)',
                border: '1px solid rgba(44,229,142,0.3)',
                boxShadow: '0 0 44px rgba(44,229,142,0.15)',
              }}
            >
              {data.category.icon || '📁'}
            </span>
            <div>
              <span className="eyebrow" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--em)', marginBottom: 6 }}>
                Category
              </span>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 560, fontSize: 'clamp(1.8rem, 4.5vw, 2.6rem)', letterSpacing: '-0.02em' }}>
                {data.category.name}
              </h1>
            </div>
          </div>
        </Reveal>
        {data.category.description && (
          <Reveal i={2}>
            <p style={{ color: 'var(--ink-dim)', maxWidth: '60ch' }}>{data.category.description}</p>
          </Reveal>
        )}
        {data.businesses.length === 0 ? (
          <div className="empty">
            <span className="empty-icon floaty" aria-hidden>
              🌱
            </span>
            <h2>No businesses in this category yet</h2>
            <p>
              Check back soon, or <a href="/businesses">browse all businesses</a>.
            </p>
          </div>
        ) : (
          <div className="grid grid-biz" style={{ marginTop: 22 }}>
            {data.businesses.map((b, i) => (
              <Reveal key={b.id} i={i % 4}>
                <BusinessCard b={b} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
