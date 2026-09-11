import type { Metadata } from 'next';
import './globals.css';
import { SITE_URL } from '@/lib/config';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'CyberShop — Find a business. Talk to it on WhatsApp.',
    template: '%s · CyberShop',
  },
  description:
    'Browse verified businesses and their catalogues, then talk directly to the business on WhatsApp. No carts, no checkout — just a conversation.',
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    siteName: 'CyberShop',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
