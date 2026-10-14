import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AUDIENCE_LABEL, GUIDES, guideBySlug, guidesByAudience } from '@/lib/guides';

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) return { title: 'Guide not found' };
  return {
    title: `${guide.title} — CyberShop Help`,
    description: guide.summary,
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const siblings = guidesByAudience(guide.audience);
  const idx = siblings.findIndex((g) => g.slug === guide.slug);
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next = idx < siblings.length - 1 ? siblings[idx + 1] : undefined;
  const related = guide.related.map(guideBySlug).filter(Boolean);

  return (
    <main>
      <article className="section wrap">
        <div className="container help-article">
          <nav className="help-crumbs" aria-label="Breadcrumb">
            <a href="/help">Help Centre</a>
            <span aria-hidden> / </span>
            <a href={`/help#${guide.audience}`}>{AUDIENCE_LABEL[guide.audience]}</a>
          </nav>

          <header className="help-head">
            <span className="help-head-icon" aria-hidden>{guide.icon}</span>
            <div>
              <h1>{guide.title}</h1>
              <p>{guide.summary}</p>
              <p className="help-meta">{AUDIENCE_LABEL[guide.audience]} · {guide.minutes} min read</p>
            </div>
          </header>

          <nav className="help-toc" aria-label="On this page">
            <strong>On this page</strong>
            <ol>
              {guide.sections.map((s, i) => (
                <li key={i}><a href={`#s${i}`}>{s.heading}</a></li>
              ))}
            </ol>
          </nav>

          {guide.sections.map((s, i) => (
            <section key={i} id={`s${i}`} className="help-section">
              <h2>{s.heading}</h2>
              {s.body?.map((p, j) => <p key={j}>{p}</p>)}
              {s.steps && (
                <ol className="help-steps">
                  {s.steps.map((step, j) => <li key={j}>{step}</li>)}
                </ol>
              )}
              {s.tips?.map((t, j) => (
                <p key={j} className="help-tip"><span aria-hidden>💡</span> {t}</p>
              ))}
              {s.warning && (
                <p className="help-warn"><span aria-hidden>⚠️</span> {s.warning}</p>
              )}
            </section>
          ))}

          {guide.cta && (
            <div className="help-cta card">
              <div>
                <h2>Put it into practice</h2>
                <p>This guide is about a real place in the app — go straight there.</p>
              </div>
              <a className="btn btn-gold sheen big" href={guide.cta.href}>{guide.cta.label} →</a>
            </div>
          )}

          {related.length > 0 && (
            <section className="help-related">
              <h2>Related guides</h2>
              <div className="help-grid">
                {related.map((g) => (
                  <a key={g!.slug} href={`/help/${g!.slug}`} className="help-card">
                    <span className="help-card-icon" aria-hidden>{g!.icon}</span>
                    <span className="help-card-body">
                      <strong>{g!.title}</strong>
                      <span>{g!.summary}</span>
                    </span>
                    <span className="help-card-arrow" aria-hidden>→</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <nav className="help-pager" aria-label="More guides for this audience">
            {prev ? <a href={`/help/${prev.slug}`}>← {prev.title}</a> : <span />}
            <a href="/help">All guides</a>
            {next ? <a href={`/help/${next.slug}`}>{next.title} →</a> : <span />}
          </nav>
        </div>
      </article>
    </main>
  );
}
