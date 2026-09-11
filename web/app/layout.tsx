import type { Metadata, Viewport } from 'next';
import Fraunces from 'next/font/local';
import './globals.css';
import { SITE_URL } from '@/lib/config';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HeaderFx, TransitionFx } from '@/components/Motion';

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
    'Browse catalogues from real businesses, then talk directly to the business on WhatsApp. No carts, no checkout — just a conversation.',
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    siteName: 'CyberShop',
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
        <HeaderFx />
        <TransitionFx />
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
