import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sell on CyberShop — open your storefront',
  description:
    'Create a free business account: publish a living catalogue, get a beautiful storefront, and let buyers reach you directly on WhatsApp.',
  alternates: { canonical: '/register' },
  openGraph: { title: 'Sell on CyberShop', url: '/register' },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
