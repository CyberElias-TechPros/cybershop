'use client';

import { useState } from 'react';
import WaCta from './WaCta';

interface Variant {
  id: number;
  name: string;
  options: string[];
  price_display: string | null;
  stock_qty: number | null;
}

/** Variant chips + the WhatsApp enquiry. The Worker re-checks the variant. */
export default function EnquiryBox({
  businessId,
  listingId,
  waUrl,
  ctaLabel,
  messagePreview,
  variants,
}: {
  businessId: number;
  listingId: number;
  waUrl?: string | null;
  ctaLabel?: string;
  messagePreview?: string;
  variants?: Variant[];
}) {
  const [variantId, setVariantId] = useState<number | null>(variants?.[0]?.id ?? null);
  const picked = variants?.find((v) => v.id === variantId);
  return (
    <div>
      {variants && variants.length > 0 && (
        <fieldset className="report-reasons" style={{ marginBottom: 14 }}>
          <legend style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 8 }}>Choose an option</legend>
          {variants.map((v) => (
            <label key={v.id}>
              <input type="radio" name="variant" checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
              {v.name}: {v.options.join(', ')}
              {v.price_display ? ` · ${v.price_display}` : ''}
              {v.stock_qty === 0 ? ' · out of stock' : ''}
            </label>
          ))}
        </fieldset>
      )}
      <WaCta
        businessId={businessId}
        listingId={listingId}
        waUrl={waUrl}
        ctaLabel={ctaLabel}
        withDetails
        messagePreview={messagePreview}
        variantId={picked?.id ?? null}
      />
    </div>
  );
}
