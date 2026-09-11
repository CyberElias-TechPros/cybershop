import type { ItemOut } from '@/lib/types';
import type { BusinessOut } from '@/lib/types';

export default function ItemCard({ item, biz }: { item: ItemOut; biz: BusinessOut }) {
  const href = `/business/${biz.slug}/${item.url_segment}/${item.slug}`;
  const img = item.images[0];
  return (
    <a className="card" href={href} style={{ color: 'inherit' }}>
      <div className="item-img">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={img.alt} loading="lazy" />
        ) : (
          <div className="no-img" aria-hidden>
            🏷️
          </div>
        )}
      </div>
      <div className="item-body">
        <p className="item-name">{item.name}</p>
        <div className="item-price">{item.price_display}</div>
        {item.cta_label && <span className="item-cta">💬 {item.cta_label}</span>}
      </div>
    </a>
  );
}
