import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * The app is a public marketplace that handles logins, uploads and payments, so
 * the baseline headers are set here once rather than per-route. Two notes on
 * the choices:
 *
 *  - `frame-ancestors` allows the Arena/e2b preview hosts in addition to 'self'.
 *    The site is not a target for clickjacking from those hosts, and blocking
 *    them would break live previews of every branch.
 *  - `unsafe-inline` is required for scripts: Next injects bootstrap scripts,
 *    the safety ribbon and theme run pre-paint to avoid a flash, and the
 *    storefront/item pages emit JSON-LD inline. `unsafe-eval` is dev-only
 *    (Next's HMR uses it) and dropped in production builds.
 *  - Third-party scripts are allow-listed by host: the Cloudflare Web
 *    Analytics beacon and Google AdSense (script + ad iframes). Tighten
 *    this list if either integration is ever removed.
 */
const siteUrl = process.env.SITE_URL || '';
const production = siteUrl.startsWith('https://') && !/\.(e2b\.app|vercel\.app)$/.test(new URL(siteUrl).hostname);

const scriptSrc = production
  ? "'self' 'unsafe-inline' https://static.cloudflareinsights.com https://pagead2.googlesyndication.com https://googleadsyndication.com https://www.googletagmanager.com https://www.googletagservices.com https://partner.googleadservices.com"
  : "'self' 'unsafe-inline' 'unsafe-eval'";

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data: https:",
  "connect-src 'self' https://api.paystack.co https://checkout.paystack.com",
  // Paystack opens its checkout in an iframe/inline page.
  "frame-src 'self' https://paystack.com https://checkout.paystack.com https://js.paystack.co https://googleadsyndication.com https://googlesyndication.com https://www.google.com",
  // Preview hosts are allowed so branch previews keep working; a live
  // deployment is only ever framed by itself.
  "frame-ancestors 'self' https://*.e2b.app https://*.arena.ai",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const baseHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Voice notes and product photos are recorded/taken on the device; nothing
  // else needs to ask the visitor for permission.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()' },
  { key: 'Content-Security-Policy', value: csp },
];

const headers = production
  ? [...baseHeaders, { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
  : baseHeaders;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ['*.e2b.app', '*.arena.ai', 'localhost', '127.0.0.1'],
  async headers() {
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
