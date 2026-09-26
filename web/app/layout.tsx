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
import OfflineSW from '@/components/OfflineSW';

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

/**
 * Runs before first paint: flags JS support (the reveal states are gated on
 * it) and decides whether the intro curtain should play. The curtain has to be
 * in the server HTML — mounted from an effect it lands on top of content that
 * is already readable and blanks the screen. It is skipped for repeat views in
 * the same session and for the dashboard/admin workbenches.
 */
const BOOT_JS = `document.documentElement.classList.add("js");
try{var p=location.pathname;
if(sessionStorage.getItem("cs-intro")==="1"||p.indexOf("/dashboard")===0||p.indexOf("/admin")===0||p.indexOf("/account")===0){
document.documentElement.classList.add("no-intro");}else{sessionStorage.setItem("cs-intro","1");}
}catch(e){document.documentElement.classList.add("no-intro");}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_JS }} />
      </head>
      <body>
        {/* Brand curtain — server-rendered so it covers the very first paint
            (see BOOT_JS above; Atmosphere retires it on first interaction). */}
        <div className="cine-intro" aria-hidden="true">
          <div className="cine-intro-line" />
          <p className="cine-intro-mark">
            Cyber<span>Shop</span>
          </p>
          <p className="cine-intro-sub">The night market, always open</p>
        </div>
        <Atmosphere />
        <OfflineSW />
        <HeaderFx />
        <TransitionFx />
        <FlipBridge />
        <CartChip />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
