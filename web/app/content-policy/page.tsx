import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Content policy',
  description: 'What can be listed on CyberShop, and what we take down.',
  alternates: { canonical: '/content-policy' },
};

export default function ContentPolicyPage() {
  return (
    <section className="section prose-page">
      <div className="container prose">
        <nav className="crumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden>/</span>
          <span>Content policy</span>
        </nav>
        <h1>Content <em>policy</em></h1>
        <p className="prose-updated">Last updated: September 2026</p>
        <p>
          CyberShop is a catalogue. Vendors present what they offer. Buyers start a conversation.
          We do not take a cut of those deals, and we do not publish ratings that nobody earned.
        </p>
        <h2>Allowed</h2>
        <ul>
          <li>Real goods, services, courses, events, property, and jobs the vendor can actually deliver.</li>
          <li>Honest photos of the item or the work. Stock photos must be labelled as such in the description.</li>
          <li>Prices in naira, or a clear “price on request”.</li>
        </ul>
        <h2>Not allowed</h2>
        <ul>
          <li>Weapons, drugs, stolen goods, or anything illegal in Nigeria.</li>
          <li>Financial scams, money-doubling, fake jobs that ask for a fee up front, or impersonation.</li>
          <li>Sexual content involving anyone under 21, or any exploitative listing.</li>
          <li>Hate, harassment, or listings whose only purpose is to spam WhatsApp numbers.</li>
          <li>Fake reviews, fake “verified” claims, or photos that are not yours and are presented as if they are.</li>
        </ul>
        <h2>What we do</h2>
        <p>
          Anyone can <strong>report</strong> a listing. Admins can archive it, suspend the store, and hide a review.
          Buyers can <strong>block</strong> a seller so that seller disappears from their browse and cannot be enquired with from that account.
          Repeated abuse ends the account.
        </p>
        <p>
          See also <Link href="/safety">Safety</Link>, <Link href="/terms">Terms</Link>, and <Link href="/privacy">Privacy</Link>.
        </p>
      </div>
    </section>
  );
}
