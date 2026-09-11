'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addLine, cartCount, cartTotalKobo, clearCart, getCart, removeLine, setQty,
  type CartLine,
} from '@/lib/cart';
import { haptic } from '@/lib/haptics';

/* ------------------------------------------------------------------ */
/* fly-to-cart: the image sphere arcs into the chip                    */
/* ------------------------------------------------------------------ */

export function flyToCart(from: { x: number; y: number; w: number; h: number }, imgSrc: string | null) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    pingChip();
    return;
  }
  const chip = document.querySelector('.cart-chip') as HTMLElement | null;
  const cr = chip?.getBoundingClientRect();
  const tx = cr ? cr.left + cr.width / 2 : window.innerWidth - 40;
  const ty = cr ? cr.top + cr.height / 2 : window.innerHeight - 60;
  const sx = from.x + from.w / 2;
  const sy = from.y + from.h / 2;
  // quadratic bezier control point: above the midpoint → arc
  const cx = (sx + tx) / 2;
  const cy = Math.min(sy, ty) - 140;

  const el = document.createElement('div');
  el.className = 'fly-ball';
  if (imgSrc) {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = '';
    el.appendChild(img);
  } else {
    el.textContent = '🛒';
  }
  document.body.appendChild(el);

  const D = 720;
  const t0 = performance.now();
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / D);
    const e = ease(p);
    const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * tx;
    const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * ty;
    const s = 1 - 0.68 * e;
    el.style.transform = `translate(${x - 19}px, ${y - 19}px) scale(${s.toFixed(3)}) rotate(${(e * 220).toFixed(0)}deg)`;
    if (p < 1) requestAnimationFrame(step);
    else {
      el.remove();
      pingChip();
    }
  };
  requestAnimationFrame(step);
}

function pingChip() {
  const chip = document.querySelector('.cart-chip') as HTMLElement | null;
  if (!chip) return;
  haptic('pop');
  chip.classList.add('chip-pop');
  setTimeout(() => chip.classList.remove('chip-pop'), 480);
}

/* ------------------------------------------------------------------ */
/* add-to-cart button (cards + item page)                              */
/* ------------------------------------------------------------------ */

export function AddToCart({
  bizId, bizName, listingId, name, priceKobo, priceDisplay, image, label,
}: {
  bizId: number;
  bizName: string;
  listingId: number;
  name: string;
  priceKobo: number | null;
  priceDisplay: string;
  image: string | null;
  /** Long form (item page); omit for the small card button. */
  label?: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const onAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // fly the product image, not the button: find the card's image area
    const imgArea = btnRef.current?.closest('.card, .item-layout')?.querySelector('.item-img, .biz-thumb, .gallery .main-img') ?? null;
    const r = (imgArea ?? btnRef.current)?.getBoundingClientRect();
    addLine(bizId, bizName, { listing_id: listingId, name, price_kobo: priceKobo, price_display: priceDisplay, image });
    haptic('double');
    if (r) flyToCart({ x: r.left, y: r.top, w: r.width, h: r.height }, image);
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={`btn-cart${label ? '' : ' btn-cart-compact'}`}
      onClick={onAdd}
      aria-label={`Add ${name} to cart`}
    >
      {label ? '＋ Add to cart' : '＋ Cart'}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* floating chip + drawer                                              */
/* ------------------------------------------------------------------ */

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default function CartChip() {
  const [bizId, setBizId] = useState<number | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const refresh = () => {
    // re-read the active business; hide if its cart is empty
    const s = JSON.parse(localStorage.getItem('cs-cart-v1') ?? '{}') as Record<string, { items: Record<string, CartLine>; name: string }>;
    const active = Number(s.active ?? 0);
    const biz = active ? s[active] : null;
    if (!biz || Object.keys(biz.items).length === 0) {
      setBizId(null);
      return;
    }
    setBizId(active);
    setName(biz.name);
    setLines(Object.values(biz.items).sort((a, b) => a.listing_id - b.listing_id));
  };

  useEffect(() => {
    refresh();
    window.addEventListener('cs-cart', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('cs-cart', refresh);
      window.removeEventListener('storage', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (bizId === null || lines.length === 0) return null;
  const count = cartCount(bizId);
  const total = cartTotalKobo(bizId);
  const hasUnknown = lines.some((l) => l.price_kobo === null);

  async function contactVendor() {
    if (bizId === null || busy) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/public/inquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ business_id: bizId, items: lines.map((l) => ({ listing_id: l.listing_id, quantity: l.qty })) }),
      });
      const j = await res.json();
      if (res.ok && j?.wa_url) {
        const w = window.open(j.wa_url, '_blank', 'noopener');
        if (!w) window.location.href = j.wa_url;
        haptic('long');
        clearCart(bizId);
        setOpen(false);
      } else {
        setErr('We couldn’t open WhatsApp — please try again.');
      }
    } catch {
      setErr('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="cart-chip"
        onClick={() => {
          refresh();
          setOpen(true);
        }}
        aria-label={`Cart — ${count} item${count === 1 ? '' : 's'}`}
      >
        <span className="cart-chip-icon" aria-hidden="true">🛒</span>
        {count > 0 && <span className="cart-chip-badge">{count > 99 ? '99+' : count}</span>}
        <span className="cart-chip-total">{total > 0 ? naira(total) : '…'}</span>
      </button>

      {open && (
        <div className="cart-drawer-backdrop" onClick={() => setOpen(false)}>
          <div className="cart-drawer" role="dialog" aria-modal="true" aria-label={`Cart — ${name}`} onClick={(e) => e.stopPropagation()}>
            <div className="cart-drawer-head">
              <div>
                <h2>Your cart</h2>
                <p className="cart-drawer-biz">{name}</p>
              </div>
              <button type="button" className="cart-x" aria-label="Close cart" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="cart-lines">
              {lines.map((l) => (
                <div className="cart-line" key={l.listing_id}>
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="cart-line-img" src={l.image} alt="" />
                  ) : (
                    <div className="cart-line-img cart-line-img-empty" aria-hidden="true">🏷️</div>
                  )}
                  <div className="cart-line-info">
                    <span className="cart-line-name">{l.name}</span>
                    <span className="cart-line-price">{l.price_display}</span>
                  </div>
                  <div className="cart-line-qty">
                    <button type="button" aria-label="Decrease" onClick={() => { setQty(bizId, l.listing_id, l.qty - 1); refresh(); }}>−</button>
                    <span>{l.qty}</span>
                    <button type="button" aria-label="Increase" onClick={() => { setQty(bizId, l.listing_id, l.qty + 1); refresh(); }}>+</button>
                  </div>
                  <button type="button" className="cart-line-x" aria-label={`Remove ${l.name}`} onClick={() => { removeLine(bizId, l.listing_id); refresh(); }}>✕</button>
                </div>
              ))}
            </div>

            <div className="cart-total">
              <span>Estimated total</span>
              <strong>{total > 0 ? naira(total) : '—'}</strong>
            </div>
            {hasUnknown && <p className="cart-total-note">Some items are priced on request — the vendor will confirm in chat.</p>}

            {err && <p className="cart-err" role="alert">{err}</p>}

            <button type="button" className="btn btn-wa cart-cta" onClick={contactVendor} disabled={busy}>
              {busy ? 'Opening WhatsApp…' : '💬 Contact vendor on WhatsApp'}
            </button>
            <p className="cart-note">
              One message lists everything you picked — with the estimated total. The vendor confirms
              availability and final price. No account needed.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
