import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The plain-language rules for using CyberShop — for buyers and for vendors.',
  alternates: { canonical: '/terms' },
};

/**
 * Plain-language terms. This is the baseline a payments partner (Paystack)
 * and an app store review require to exist; it is not legal advice — have a
 * lawyer review before aggressive scaling or regulated use.
 */
export default function TermsPage() {
  return (
    <section className="section prose-page">
      <div className="container prose">
        <nav className="crumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden>/</span>
          <span>Terms</span>
        </nav>
        <h1>
          Terms of <em>Service</em>
        </h1>
        <p className="prose-updated">Last updated: September 2026</p>

        <p className="notice" style={{ marginTop: 22 }}>
          <strong>Read this first:</strong> CyberShop is free to browse and never takes a buyer’s
          money. There is no checkout here and no escrow. Because we are not in the deal,{' '}
          <strong>you must verify before you pay</strong> — inspect the goods or see the service
          done, then pay the seller directly. See the{' '}
          <Link href="/safety">safety guide</Link> for the rules we ask every visitor to follow.
        </p>

        <h2>1. What CyberShop is</h2>
        <p>
          CyberShop is a directory and catalogue platform. Vendors publish storefronts and
          catalogues; buyers browse them and contact the vendor directly on WhatsApp.
          <strong> CyberShop is not a party to any deal</strong> between a buyer and a vendor: we
          never hold goods, never handle buyer payments, never ship anything, and never take a cut
          of a sale.
        </p>

        <h2>2. What CyberShop is not</h2>
        <p>
          We are not an escrow service, a marketplace of record, a delivery company, or a payment
          agent. Any money that changes hands between a buyer and a vendor happens entirely outside
          CyberShop, on terms the two of them agree on.
        </p>
        <p>
          <strong>No buyer protection, by design.</strong> We cannot refund, reverse, or guarantee a
          payment we never received, and we cannot vouch for every listing. What we do instead is
          keep the market legible: reports are reviewed by a human, scam listings are removed, and
          vendors who break the rules lose their stall. Until you have verified the goods or the
          service, do not send money — nobody from CyberShop will ever ask you to.
        </p>

        <h2>3. Your account</h2>
        <ul>
          <li>You must give accurate information when registering a business.</li>
          <li>Keep your password safe; you are responsible for activity under your account.</li>
          <li>
            You must be allowed to trade the goods and services you list, and comply with all
            applicable Nigerian laws (including tax and consumer-protection rules).
          </li>
        </ul>

        <h2>4. Subscriptions &amp; payments to us</h2>
        <ul>
          <li>Vendor plans renew on the interval shown at checkout until cancelled.</li>
          <li>
            Bank-transfer payments become a subscription only after our team verifies your proof;
            Paystack payments activate automatically after verification.
          </li>
          <li>
            Receipts for platform subscription payments are available in your dashboard under{' '}
            <Link href="/dashboard/billing">Plan &amp; Billing</Link>.
          </li>
          <li>
            If a payment is refunded or charged back, the associated plan or add-on may be
            deactivated.
          </li>
        </ul>

        <h2>5. What you may not list</h2>
        <p>
          No prohibited or regulated goods (weapons, drugs, human or wildlife products, counterfeit
          items), no financial scams or &ldquo;too good to be true&rdquo; money-doubling offers, no
          adult content, nothing that infringes someone else&apos;s rights. We may remove listings
          and suspend stores that break these rules — with a note explaining why.
        </p>

        <h2>6. Content you give us</h2>
        <p>
          You keep ownership of your catalogue content. You give us permission to display it on
          your storefront, in previews (for example on WhatsApp), and in promotional features of
          the platform. Don&apos;t post content you have no right to publish.
        </p>

        <h2>7. Availability</h2>
        <p>
          We work hard to keep the market open, but the service is provided &ldquo;as is&rdquo;.
          We are not liable for lost profits or deals that fell through — including when the
          platform is temporarily unavailable.
        </p>

        <h2>8. Closing accounts</h2>
        <p>
          You can stop using CyberShop at any time. We can suspend or close accounts that break
          these terms, break the law, or harm buyers, vendors, or the platform.
        </p>

        <h2>9. Changes</h2>
        <p>
          We may update these terms as the platform grows. Material changes will be announced on
          the platform. Continuing to use CyberShop after a change means you accept it.
        </p>

        <h2>10. Contact</h2>
        <p>
          Questions about these terms? <Link href="/contact">Contact us</Link> — a human reads it.
        </p>
      </div>
    </section>
  );
}
