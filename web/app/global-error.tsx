'use client';

/**
 * Last-resort boundary (the root layout itself failed). It replaces <html>, so
 * none of the app stylesheets are guaranteed to be present — everything here is
 * inline. The job is simply to never leave a visitor on a blank screen.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#060b09',
          color: '#edf5f1',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 520 }}>
          <p style={{ fontSize: '0.78rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#f2c879', fontWeight: 700 }}>
            CyberShop
          </p>
          <h1 style={{ fontSize: '1.7rem', lineHeight: 1.2, margin: '10px 0 12px' }}>
            We could not load the market
          </h1>
          <p style={{ color: '#a3bcb2', margin: '0 0 24px' }}>
            Reload the page — if it keeps happening, the address is likely wrong
            or our catalogue service is down for maintenance.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '12px 22px',
                borderRadius: 999,
                border: 0,
                background: '#f2c879',
                color: '#241a06',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '12px 22px',
                borderRadius: 999,
                border: '1px solid rgba(237,245,241,0.2)',
                color: '#edf5f1',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.95rem',
              }}
            >
              Back home
            </a>
          </div>
          {error?.digest && (
            <p style={{ color: '#6f8d7f', fontSize: '0.76rem', marginTop: 22 }}>Reference: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
