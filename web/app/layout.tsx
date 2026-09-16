import type { Metadata, Viewport } from 'next';
import Fraunces from 'next/font/local';
import '@fontsource-variable/syne';
import './globals.css';
import './cine.css';
import { SITE_URL } from '@/lib/config';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HeaderFx, TransitionFx } from '@/components/Motion';
import { FlipBridge } from '@/components/Fx';
import CartChip from '@/components/CartFx';
import Atmosphere from '@/components/Atmosphere';

const fraunces = Fraunces({
  src: [{ path: './fonts/Fraunces.ttf', weight: '300 700', style: 'normal' }],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'CyberShop — Find a business. Talk to it on WhatsApp.',
    template: '%s · CyberShop',
  },
  description:
    'Browse catalogues from real Nigerian businesses, then send a WhatsApp list — never a checkout. The vendor replies. You deal in the thread.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/icon-192.png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    siteName: 'CyberShop',
    url: '/',
    images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: 'CyberShop — find a business, talk to it on WhatsApp' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-default.jpg'],
  },
};

export const viewport: Viewport = {
  themeColor: '#060b09',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable}>
      <head>
        <script
          // Progressive-enhancement gate: hidden reveal states apply only when JS runs.
          dangerouslySetInnerHTML={{ __html: 'document.documentElement.classList.add("js")' }}
        />
      </head>
      <body>
        <Atmosphere />
        <HeaderFx />
        <TransitionFx />
        <FlipBridge />
        <CartChip />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
