'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Route-level error boundary.
 *
 * Without one, any Worker hiccup on a server-rendered page surfaced Next's
 * bare "Application error: a client-side exception has occurred" screen with no
 * way forward. This keeps the visitor in the market: retry, go home, or browse.
 *
 * It also *retries once by itself*. Most of these failures are a cold-start
 * race between the web process and the catalogue Worker: the first attempt
 * times out, the second (milliseconds later, now warm) succeeds. Making the
 * visitor press "Try again" for that is a broken tap — so we press it for them,
 * once. If the retry fails too, the manual screen below takes over.
 */

/** pathname → timestamp of the last automatic retry. Module-scoped so it
 *  survives the remount that `reset()` causes (a plain useRef would not). */
const autoRetried = new Map<string, number>();
const AUTO_RETRY_WINDOW_MS = 20_000;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Surfaced in the server log by Next; kept here so the digest is traceable.
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const key = typeof window === 'undefined' ? 'server' : window.location.pathname;
    const last = autoRetried.get(key) ?? 0;
    if (Date.now() - last < AUTO_RETRY_WINDOW_MS) return; // already tried recently — let the human decide
    autoRetried.set(key, Date.now());
    setRetrying(true);
    const t = setTimeout(() => {
      try {
        reset();
      } catch {
        setRetrying(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [error, reset]);

  if (retrying) {
    return (
      <div className="notfound" role="status" aria-live="polite">
        <span className="face floaty" aria-hidden>
          🕯️
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 540, marginBottom: 8 }}>
          Reconnecting…
        </h1>
        <p style={{ color: 'var(--ink-faint)', maxWidth: '46ch', margin: '0 auto' }}>
          The catalogue service is waking up. One moment.
        </p>
      </div>
    );
  }

  return (
    <div className="notfound">
      <span className="face floaty" aria-hidden>
        🕯️
      </span>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 540, marginBottom: 8 }}>
        This lane is still dark
      </h1>
      <p style={{ color: 'var(--ink-faint)', maxWidth: '46ch', margin: '0 auto 26px' }}>
        We could not load this page — usually a slow catalogue service or a lost
        connection. Nothing you did. Try again in a moment.
      </p>
      <div className="cta-actions">
        <button
          type="button"
          className="btn btn-gold sheen"
          onClick={() => {
            const key = typeof window === 'undefined' ? 'server' : window.location.pathname;
            autoRetried.set(key, Date.now());
            reset();
          }}
        >
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
