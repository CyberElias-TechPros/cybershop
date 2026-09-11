"use client";

/**
 * The most important 200 lines in the product (plan.md 69): this is the button the whole
 * platform exists to be clicked. It never asks for a login, never opens a modal, and
 * degrades to a plain anchor when JS is off.
 */
import { useId, useMemo, useState, useTransition } from "react";
import { enquireAction } from "@/core/wa-cta";

type Props = {
  business: { id: string; name: string; hasNumber: boolean };
  item: { id: string; name: string; slug: string; sku: string | null; price: string | null; currency: string };
  imageUrl: string | null;
  pageUrl: string;
  ctaVerb: string;
  variants: Array<{ id: string; name: string; price: string | null; stockQty: number | null; isAvailable: boolean }>;
  fieldLines: string[];
  offerLine: string | null;
};

export function EnquireForm({ business, item, imageUrl, pageUrl, ctaVerb, variants, fieldLines, offerLine }: Props) {
  const uid = useId();
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState(variants.length === 1 ? variants[0]!.id : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const variant = useMemo(() => variants.find((v) => v.id === variantId) ?? null, [variants, variantId]);
  const price = variant?.price ?? item.price ?? null;
  

  if (!business.hasNumber) {
    return (
      <div className="rounded-lg border border-[#f0d9ab] bg-[#fdf7ea] p-3 text-sm">
        This business has not added a WhatsApp number yet, so enquiries are closed. Use the contact form on their page.
      </div>
    );
  }

  return (
    <form
      action={enquireAction}
      onSubmit={() => setError(null)}
      className="grid gap-3"
    >
      <input type="hidden" name="businessId" value={business.id} />
      <input type="hidden" name="businessName" value={business.name} />
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="itemName" value={item.name} />
      <input type="hidden" name="sku" value={item.sku ?? ""} />
      <input type="hidden" name="price" value={price ?? ""} />
      <input type="hidden" name="currency" value={item.currency} />
      <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />
      <input type="hidden" name="pagePath" value={pageUrl} />
      <input type="hidden" name="offerLine" value={offerLine ?? ""} />
      <input type="hidden" name="variantLabel" value={variant?.name ?? ""} />
      <input type="hidden" name="quantity" value={String(qty)} />
      <input type="hidden" name="fieldLines" value={fieldLines.join("\u001f")} />
      <input type="hidden" name="visitorId" value={typeof window !== "undefined" ? localStorage.getItem("cyber_vid") ?? "" : ""} />

      {variants.length > 1 ? (
        <div className="grid gap-1.5">
          <label className="field-label" htmlFor={`${uid}-variant`}>Choose an option</label>
          <select id={`${uid}-variant`} className="select" name="variant" value={variantId}
            onChange={(e) => setVariantId(e.target.value)}>
            <option value="">No preference</option>
            {variants.filter((v) => v.isAvailable).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}{v.price ? ` - ${money(v.price, item.currency)}` : ""}{v.stockQty !== null ? ` (${v.stockQty} left)` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid gap-1.5 sm:max-w-[180px]">
        <label className="field-label" htmlFor={`${uid}-qty`}>Quantity</label>
        <input id={`${uid}-qty`} className="input" type="number" inputMode="numeric" min={1} max={999}
          value={qty} onChange={(e) => setQty(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-wa btn-lg btn-block"
        aria-describedby={`${uid}-note`}
      >
        <WhatsAppMark />
        {pending ? "Opening WhatsApp..." : `${ctaVerb} on WhatsApp`}
      </button>
      <p id={`${uid}-note`} className="text-xs text-[var(--color-ink-faint)]">
        WhatsApp opens with your details already typed out. Nothing is sent until you press send, and {business.name} agrees the final price with you.
      </p>
      {error ? <p role="alert" className="field-error">{error}</p> : null}

    </form>
  );
}

function money(v: string, currency: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return (currency === "NGN" ? "\u20a6" : `${currency} `) + n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="currentColor">
      <path d="M12.02 2.4c-5.3 0-9.6 4.3-9.6 9.6 0 1.7.44 3.35 1.29 4.81L2.4 21.6l4.93-1.29a9.57 9.57 0 0 0 4.69 1.2h.01c5.3 0 9.6-4.3 9.6-9.6 0-2.57-1-4.98-2.82-6.8A9.55 9.55 0 0 0 12.02 2.4zm0 17.4c-1.5 0-3-.4-4.3-1.2l-.3-.2-2.9.8.8-2.8-.2-.3a8.3 8.3 0 1 1 6.9 3.7z" />
    </svg>
  );
}
