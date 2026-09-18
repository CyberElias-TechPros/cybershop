/**
 * Pending state for the admin console (see app/dashboard/loading.tsx for why
 * this is scoped to the workbenches rather than the whole app).
 */
export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-bar" aria-hidden="true" />
      <div className="route-loading-body">
        <p className="route-loading-text">Loading the market…</p>
        <div className="route-loading-skels" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
