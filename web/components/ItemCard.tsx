import type { ItemOut } from '@/lib/types';
import type { BusinessOut } from '@/lib/types';
import { AddToCart } from '@/components/CartFx';

export default function ItemCard({ item, biz }: { item: ItemOut; biz: BusinessOut }) {
  const href = `/business/${biz.slug}/${item.url_segment}/${item.slug}`;
  const img = item.images[0];
  return (
    <a
      className="card tilt"
      href={href}
      style={{ color: 'inherit' }}
      data-flip={`item:${item.id}`}
      data-flip-src=""
      aria-label={`${item.name} — ${item.price_display}`}
    >
      <div className="item-img">
        <span className="skel" aria-hidden="true" />
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={img.alt} loading="lazy" />
        ) : (
          <div className="no-img" aria-hidden>
            🏷️
          </div>
        )}
        <AddToCart
          bizId={biz.id}
          bizName={biz.name}
          listingId={item.id}
          name={item.name}
          priceKobo={item.price_type === 'fixed' || item.price_type === 'from' ? item.price_kobo : null}
          priceDisplay={item.price_display}
          image={img?.url ?? null}
        />
      </div>
      <div className="item-body">
        <p className="item-name">{item.name}</p>
        <div className="item-price">{item.price_display}</div>
        {item.cta_label && <span className="item-cta">💬 {item.cta_label}</span>}
      </div>
    </a>
  );
}
