'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addLine, cartCount, cartTotalKobo, clearCart, getBuyer, lineQty, listCarts,
  removeLine, saveBuyer, setActive, setQty, type CartLine,
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

function toast(text: string) {
  document.querySelectorAll('.cine-toast').forEach((n) => n.remove());
  const el = document.createElement('div');
  el.className = 'cine-toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 380);
  }, 2200);
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
  label?: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [qty, setLocalQty] = useState(0);

  useEffect(() => {
    const sync = () => setLocalQty(lineQty(bizId, listingId));
    sync();
    window.addEventListener('cs-cart', sync);
    return () => window.removeEventListener('cs-cart', sync);
  }, [bizId, listingId]);

  const onAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const imgArea = btnRef.current?.closest('.card, .item-layout')?.querySelector('.item-img, .biz-thumb, .gallery .main-img') ?? null;
    const r = (imgArea ?? btnRef.current)?.getBoundingClientRect();
    addLine(bizId, bizName, { listing_id: listingId, name, price_kobo: priceKobo, price_display: priceDisplay, image });
    haptic('double');
    if (r) flyToCart({ x: r.left, y: r.top, w: r.width, h: r.height }, image);
    toast(`Added to cart · ${bizName}`);
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={`btn-cart${label ? '' : ' btn-cart-compact'}${qty ? ' in-cart' : ''}`}
      onClick={onAdd}
      aria-label={qty ? `${name} — ${qty} in cart, add another` : `Add ${name} to cart`}
    >
      {label ? (qty ? `＋ In cart (${qty})` : '＋ Add to cart') : qty ? `＋${qty}` : '＋ Cart'}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* panel (drawer + /cart page)                                         */
/* ------------------------------------------------------------------ */

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export function CartPanel({ onClose, embedded = false }: { onClose?: () => void; embedded?: boolean }) {
  const [bizId, setBizId] = useState<number | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [name, setName] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<{ wa: string; vendor: string } | null>(null);
  const [carts, setCarts] = useState<{ id: number; name: string; count: number }[]>([]);

  const refresh = () => {
    const s = JSON.parse(localStorage.getItem('cs-cart-v1') ?? '{}') as Record<string, { items: Record<string, CartLine>; name: string }>;
    const active = Number(s.active ?? 0);
    const biz = active ? s[active] : null;
    setCarts(listCarts());
    if (!biz || Object.keys(biz.items).length === 0) {
      setBizId(null);
      setLines([]);
      return;
    }
    setBizId(active);
    setName(biz.name);
    setLines(Object.values(biz.items).sort((a, b) => a.listing_id - b.listing_id));
  };

  useEffect(() => {
    const b = getBuyer();
    setBuyerName(b.name);
    setBuyerPhone(b.phone);
    refresh();
    window.addEventListener('cs-cart', refresh);
    return () => window.removeEventListener('cs-cart', refresh);
  }, []);

  if (sent) {
    return (
      <div className="cart-sent">
        <span className="cart-sent-mark" aria-hidden>
          ✓
        </span>
        <h2>WhatsApp is open</h2>
        <p>
          Your list is on its way to <strong>{sent.vendor}</strong>. They also received it in their
          CyberShop leads inbox — so even if the chat is missed, the enquiry is logged.
        </p>
        <ol className="cart-flow">
          <li>They confirm what’s in stock and the final price.</li>
          <li>You agree delivery or pickup in the thread.</li>
          <li>You pay the vendor directly — never through CyberShop.</li>
        </ol>
        <div className="cta-actions" style={{ justifyContent: 'flex-start' }}>
          <a className="btn btn-wa" href={sent.wa} target="_blank" rel="noopener">
            Re-open the chat
          </a>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSent(null);
              onClose?.();
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (bizId === null || lines.length === 0) {
    return (
      <div className="empty" style={{ padding: embedded ? '48px 8px' : '24px 8px' }}>
        <span className="empty-icon" aria-hidden>
          🛒
        </span>
        <h2>Your cart is empty</h2>
        <p>
          Add items from a storefront. When you’re ready, we open WhatsApp with the whole list
          already written — no checkout, no payment here.
        </p>
        <a className="btn btn-gold" href="/businesses">
          Walk the market
        </a>
      </div>
    );
  }

  const count = cartCount(bizId);
  const total = cartTotalKobo(bizId);
  const hasUnknown = lines.some((l) => l.price_kobo === null);

  async function contactVendor() {
    if (bizId === null || busy) return;
    setBusy(true);
    setErr('');
    saveBuyer({ name: buyerName, phone: buyerPhone });
    try {
      const res = await fetch('/api/public/inquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: bizId,
          name: buyerName.trim() || null,
          phone: buyerPhone.trim() || null,
          note: note.trim() || null,
          items: lines.map((l) => ({ listing_id: l.listing_id, quantity: l.qty })),
        }),
      });
      const j = await res.json();
      if (res.ok && j?.wa_url) {
        const w = window.open(j.wa_url, '_blank', 'noopener');
        if (!w) window.location.href = j.wa_url;
        haptic('long');
        const vendor = name;
        clearCart(bizId);
        setSent({ wa: j.wa_url, vendor });
      } else {
        setErr(j?.error?.message || 'We couldn’t open WhatsApp — please try again.');
      }
    } catch {
      setErr('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {carts.length > 1 && (
        <div className="cart-switch" role="tablist" aria-label="Carts by vendor">
          {carts.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === bizId ? 'on' : ''}
              onClick={() => {
                setActive(c.id);
                refresh();
              }}
            >
              {c.name} <em>{c.count}</em>
            </button>
          ))}
        </div>
      )}

      <div className="cart-drawer-head">
        <div>
          <h2>Your list for {name}</h2>
          <p className="cart-drawer-biz">
            {count} item{count === 1 ? '' : 's'} · not a checkout — a conversation
          </p>
        </div>
        {onClose && (
          <button type="button" className="cart-x" aria-label="Close cart" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <ol className="cart-flow">
        <li>Pick what you want (you’re here).</li>
        <li>We open WhatsApp with this list already written.</li>
        <li>The vendor sees the same list in their Leads inbox.</li>
        <li>You agree price, delivery and payment in the chat.</li>
      </ol>

      <div className="cart-lines">
        {lines.map((l) => (
          <div className="cart-line" key={l.listing_id}>
            {l.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="cart-line-img" src={l.image} alt="" />
            ) : (
              <div className="cart-line-img cart-line-img-empty" aria-hidden="true">
                🏷️
              </div>
            )}
            <div className="cart-line-info">
              <span className="cart-line-name">{l.name}</span>
              <span className="cart-line-price">{l.price_display}</span>
            </div>
            <div className="cart-line-qty">
              <button
                type="button"
                aria-label="Decrease"
                onClick={() => {
                  setQty(bizId, l.listing_id, l.qty - 1);
                  refresh();
                }}
              >
                −
              </button>
              <span>{l.qty}</span>
              <button
                type="button"
                aria-label="Increase"
                onClick={() => {
                  setQty(bizId, l.listing_id, l.qty + 1);
                  refresh();
                }}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="cart-line-x"
              aria-label={`Remove ${l.name}`}
              onClick={() => {
                removeLine(bizId, l.listing_id);
                refresh();
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="cart-total">
        <span>Estimated total</span>
        <strong>{total > 0 ? naira(total) : '—'}</strong>
      </div>
      {hasUnknown && (
        <p className="cart-total-note">Some items are priced on request — the vendor will confirm in chat.</p>
      )}

      <div className="cart-who">
        <label>
          Your name
          <input
            className="input"
            value={buyerName}
            maxLength={120}
            placeholder="So the vendor knows who you are"
            onChange={(e) => setBuyerName(e.target.value)}
          />
        </label>
        <label>
          Phone (optional)
          <input
            className="input"
            value={buyerPhone}
            maxLength={20}
            placeholder="0803…"
            onChange={(e) => setBuyerPhone(e.target.value)}
          />
        </label>
      </div>
      <label className="cart-note-field">
        A note for the vendor
        <textarea
          className="textarea"
          rows={2}
          maxLength={500}
          placeholder="e.g. I can pick up in Ikeja tomorrow, or deliver to VI."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {err && (
        <p className="cart-err" role="alert">
          {err}
        </p>
      )}

      <button type="button" className="btn btn-wa cart-cta" onClick={contactVendor} disabled={busy}>
        {busy ? 'Opening WhatsApp…' : '💬 Send this list on WhatsApp'}
      </button>
      <p className="cart-note">
        CyberShop never takes payment from buyers. One pre-filled WhatsApp message is the whole
        “checkout.” The vendor replies, you deal in the thread.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* floating chip + drawer                                              */
/* ------------------------------------------------------------------ */

export default function CartChip() {
  const [bizId, setBizId] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = () => {
    const s = JSON.parse(localStorage.getItem('cs-cart-v1') ?? '{}') as Record<string, { items: Record<string, CartLine>; name: string }>;
    const active = Number(s.active ?? 0);
    const biz = active ? s[active] : null;
    if (!biz || Object.keys(biz.items).length === 0) {
      setBizId(null);
      setCount(0);
      return;
    }
    setBizId(active);
    setCount(cartCount(active));
    setTotal(cartTotalKobo(active));
  };

  useEffect(() => {
    refresh();
    window.addEventListener('cs-cart', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('cs-cart', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (bizId === null && !open) return null;

  return (
    <>
      {bizId !== null && count > 0 && (
        <button
          type="button"
          className="cart-chip"
          onClick={() => {
            refresh();
            setOpen(true);
          }}
          aria-label={`Cart — ${count} item${count === 1 ? '' : 's'}`}
        >
          <span className="cart-chip-icon" aria-hidden="true">
            🛒
          </span>
          {count > 0 && <span className="cart-chip-badge">{count > 99 ? '99+' : count}</span>}
          <span className="cart-chip-total">{total > 0 ? naira(total) : 'Enquire'}</span>
        </button>
      )}

      {open && (
        <div className="cart-drawer-backdrop" onClick={() => setOpen(false)}>
          <div
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Your WhatsApp cart"
            onClick={(e) => e.stopPropagation()}
          >
            <CartPanel onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
