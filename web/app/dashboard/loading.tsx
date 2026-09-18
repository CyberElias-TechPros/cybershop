/**
 * Pending state for the vendor workbench.
 *
 * Every dashboard route is `force-dynamic` and waits on the API Worker, so
 * without this the panel shows the previous screen with no feedback until the
 * data lands — on a mobile connection that reads as a dead tap.
 *
 * Deliberately *not* a root-level loading.tsx: a root boundary would wrap the
 * public SEO surfaces (listings, storefront, item) in Suspense and stream the
 * skeleton first, which is exactly what those pages avoid (see the "no
 * Suspense shell" note in app/listings/page.tsx — WhatsApp and social
 * unfurlers read the market from the first HTML).
 */
export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-bar" aria-hidden="true" />
      <div className="route-loading-body">
        <p className="route-loading-text">Loading your stall…</p>
        <div className="route-loading-skels" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
