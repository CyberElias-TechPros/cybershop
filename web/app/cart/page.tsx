'use client';

import { CartPanel } from '@/components/CartFx';

export default function CartPage() {
  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow">WhatsApp cart</span>
            <h1>
              One list, <em>one conversation</em>
            </h1>
          </div>
        </div>
        <p style={{ color: 'var(--ink-dim)', maxWidth: '52ch', marginTop: 0 }}>
          This is not a checkout. CyberShop never charges buyers. When you send the list, WhatsApp
          opens with every item already written — and the vendor gets the same enquiry in their
          Leads inbox.
        </p>
        <div className="card panel cart-page">
          <CartPanel embedded />
        </div>
      </div>
    </section>
  );
}
