import type { Metadata } from 'next';
import Link from 'next/link';
import PageNav from '@/components/PageNav';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What CyberShop collects, why, and what we never do with it.',
  alternates: { canonical: '/privacy' },
};

/**
 * Plain-language privacy policy, matching what the platform actually does
 * (NDPR-friendly structure: purpose limitation, minimisation, rights).
 */
export default function PrivacyPage() {
  return (
    <section className="section prose-page">
        <PageNav
          title="On this page"
          intro="Plain language, no legalese. Jump to the part you need."
          sections={[
        { id: 'the-short-version', label: 'The short version' },
        { id: 'what-we-collect', label: 'What we collect' },
        { id: 'what-we-never-do', label: 'What we never do' },
        { id: 'who-processes-data-with-us', label: 'Who processes data with us' },
        { id: 'your-rights-ndpr-aligned', label: 'Your rights (NDPR-aligned)' },
        { id: 'cookies', label: 'Cookies' },
        { id: 'retention', label: 'Retention' },
        { id: 'changes', label: 'Changes' }
          ]}
        />
      <div className="container prose">
        <nav className="crumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden>/</span>
          <span>Privacy</span>
        </nav>
        <h1>
          Privacy <em>Policy</em>
        </h1>
        <p className="prose-updated">Last updated: September 2026</p>

        <h2 id="the-short-version">The short version</h2>
        <p>
          We collect the minimum needed to run the market: your account details, your catalogue,
          and coarse analytics. <strong>We never sell your data.</strong> We never take or hold
          buyer payments. Buyer phone numbers belong to buyers — they only reach a vendor when the
          buyer chooses to message that vendor on WhatsApp.
        </p>

        <h2 id="what-we-collect">What we collect</h2>
        <ul>
          <li>
            <strong>Accounts:</strong> name, email, phone (vendors), password (stored only as a
            salted one-way hash).
          </li>
          <li>
            <strong>Vendors:</strong> business profile, catalogue, WhatsApp numbers you publish,
            and payment records for your platform subscription.
          </li>
          <li>
            <strong>Buyers:</strong> nothing by default. If you create an account: your name,
            email, and saved items. Guests browse with zero data beyond an anonymous session cookie.
          </li>
          <li>
            <strong>Analytics:</strong> page views, WhatsApp-click counts, and an IP address that
            is stored only as a salted one-way hash — we cannot reverse it to your IP.
          </li>
        </ul>

        <h2 id="what-we-never-do">What we never do</h2>
        <ul>
          <li>We never sell or rent personal data.</li>
          <li>We never charge buyers or touch buyer↔vendor money.</li>
          <li>We never publish your private information (password hashes, payment proofs, your
            non-public WhatsApp numbers).</li>
        </ul>

        <h2 id="who-processes-data-with-us">Who processes data with us</h2>
        <ul>
          <li>
            <strong>Cloudflare</strong> — application database and edge network.
          </li>
          <li>
            <strong>Vercel</strong> — the website itself.
          </li>
          <li>
            <strong>Paystack</strong> — only for vendor subscription payments to CyberShop (when
            you pay by card).
          </li>
          <li>
            <strong>Email provider</strong> — only to deliver transactional email you need
            (password resets, payment receipts, renewal reminders).
          </li>
        </ul>

        <h2 id="your-rights-ndpr-aligned">Your rights (NDPR-aligned)</h2>
        <p>
          Signed-in people can download a copy of their data and close their account from{' '}
          <Link href="/account/settings">account settings</Link>. Closing a vendor account
          unpublishes the storefront. Payment records stay for the period Nigerian bookkeeping
          requires. For anything the form cannot do, <Link href="/contact">contact us</Link> — we
          respond within 30 days.
        </p>

        <h2 id="cookies">Cookies</h2>
        <p>
          One session cookie (only when you sign in) and one anonymous visitor cookie used for
          counting views and clicks. No advertising cookies, no third-party trackers.
        </p>

        <h2 id="retention">Retention</h2>
        <p>
          Account and payment records are kept as long as your account is active, plus the period
          Nigerian bookkeeping rules require for financial records. Analytics events are kept in
          aggregate form.
        </p>

        <h2 id="changes">Changes</h2>
        <p>
          If this policy changes materially, we announce it on the platform and email account
          holders where appropriate.
        </p>
      </div>
    </section>
  );
}
