'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary.
 *
 * Without one, any Worker hiccup on a server-rendered page surfaced Next's
 * bare "Application error: a client-side exception has occurred" screen with no
 * way forward. This keeps the visitor in the market: retry, go home, or browse.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the server log by Next; kept here so the digest is traceable.
    console.error(error);
  }, [error]);

  return (
    <div className="notfound">
      <span className="face floaty" aria-hidden>
        🕯️
      </span>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 540, marginBottom: 8 }}>
        The market flickered
      </h1>
      <p style={{ color: 'var(--ink-faint)', maxWidth: '46ch', margin: '0 auto 26px' }}>
        Something went wrong while loading this page — usually the connection to
        our catalogue service. Nothing you did. Try again in a moment.
      </p>
      <div className="cta-actions">
        <button type="button" className="btn btn-gold sheen" onClick={reset}>
          Try again
        </button>
        <a className="btn btn-ghost" href="/">
          Back home
        </a>
        <a className="btn btn-ghost" href="/businesses">
          Browse businesses
        </a>
      </div>
      {error?.digest && (
        <p className="err-digest" style={{ color: 'var(--ink-faint)', fontSize: '0.76rem', marginTop: 22 }}>
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
