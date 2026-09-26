import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create a buyer account',
  description: 'Save ads, keep your enquiries, and get alerts — still no checkout.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
