import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
  title: 'Contact & support',
  description: 'Talk to the CyberShop team — support for vendors and buyers, human replies.',
  alternates: { canonical: '/contact' },
};

/** Contact page (server): live support email from platform settings. */
export default async function ContactPage() {
  let supportEmail = 'support@cybershop.ng';
  try {
    const d = await api<{ site: { support_email: string } }>('/public/site');
    if (d.site?.support_email) supportEmail = d.site.support_email;
  } catch {
    /* default */
  }
  return (
    <section className="section prose-page">
      <div className="container prose">
        <nav className="crumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden>/</span>
          <span>Contact</span>
        </nav>
        <h1>
          Talk to a <em>human</em>
        </h1>
        <p className="prose-lede">
          Whether you&apos;re a vendor with a billing question or a buyer who hit something odd —
          email us and a person will reply. We aim for same-day replies, GMT+1 hours.
        </p>
        <ContactClient supportEmail={supportEmail} />
        <div className="contact-alt">
          <h2>Faster answers</h2>
          <ul>
            <li>
              <strong>Forgot your password?</strong> Use <Link href="/forgot">password recovery</Link> — instant, no ticket needed.
            </li>
            <li>
              <strong>Billing &amp; receipts:</strong> approved payments have a printable receipt in{' '}
              <Link href="/dashboard/billing">Plan &amp; Billing</Link>.
            </li>
            <li>
              <strong>A listing looks like a scam?</strong> Use the <em>Report</em> button on the listing — it goes straight to our queue.
            </li>
            <li>
              <strong>Buying safely:</strong> read <Link href="/safety">the street rules</Link> — inspect before you pay, always.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
