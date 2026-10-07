import type { Metadata } from 'next';
import SafetyTips from '@/components/SafetyTips';
import PageNav from '@/components/PageNav';
import { siteInfo } from '@/lib/site';

export const metadata: Metadata = {
  alternates: { canonical: '/safety' },
  openGraph: { url: '/safety' },

  title: 'Verify before you pay — how to buy and sell safely',
  description:
    'CyberShop is a catalogue and an introduction, never a shop. Verify the goods or service first, pay the seller on delivery or collection, and never send money to an account we did not give you.',
};

const RULES = [
  {
    n: '01',
    title: 'Talk first',
    body: 'Ask every question on WhatsApp before money moves. Price, condition, quantity, delivery, meeting point — in writing, in the thread.',
  },
  {
    n: '02',
    title: 'Verify second',
    body: 'See the item. A live video call, more photos, a receipt, a serial number, or your own eyes at pickup. If verification is impossible, do not pay.',
  },
  {
    n: '03',
    title: 'Pay last',
    body: 'Only pay when the goods are in your hand or the service is done. Pay on delivery, pay on collection, or pay a deposit you can afford to lose — never a full advance to a stranger.',
  },
];

const NEVER = [
  'CyberShop never collects payment from a buyer. There is no checkout on this site and there never will be.',
  'CyberShop never holds your money, your goods, or a “delivery deposit”. Any message claiming otherwise is a scam.',
  'CyberShop never asks you for your card, your bank app, a transfer code or an OTP.',
  'CyberShop never sells your phone number to vendors. You choose who to message.',
];

const RED_FLAGS = [
  'The price is far below every other seller for the same item.',
  'They refuse a video call, a meeting, or cash on delivery — and push you to pay now.',
  'They rush you: “this offer ends in ten minutes”, “someone else is paying”.',
  'The payment account name does not match the person or business you have been chatting with.',
  'They ask you to pay a “CyberShop fee”, “platform fee”, “insurance” or “logistics release”.',
  'They move the conversation off WhatsApp to a link, a form, or a “customer care” number.',
];

const IF_IT_GOES_WRONG = [
  'Stop sending money. No further transfers “to release” the first one — that is the second bite.',
  'Keep the WhatsApp thread, the listing link and any proof of payment. Screenshots count.',
  'Report the listing or the business with ⚑ Report. Every report is reviewed by a human.',
  'Tell your bank immediately if you transferred money, and report it to your local police station or the EFCC.',
];

export default async function SafetyPage() {
  const { support_email: supportEmail, safety } = await siteInfo();

  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
        <PageNav
          title="On this page"
          intro="How to deal safely, and what we do when it goes wrong."
          sections={[
        { id: 'the-three-beats-of-a-safe-deal', label: 'The three beats of a safe deal' },
        { id: 'what-cybershop-never-does', label: 'What CyberShop never does' },
        { id: 'red-flags-walk-away', label: 'Red flags — walk away' },
        { id: 'if-something-goes-wrong', label: 'If something goes wrong' },
        { id: 'for-vendors', label: 'For vendors' },
        { id: 'our-part', label: 'Our part' }
          ]}
        />
      <div className="container" style={{ maxWidth: 780 }}>
        <span className="eyebrow">Trust &amp; safety</span>
        <h1>
          Verify first. <em>Pay last.</em>
        </h1>
        <p className="prose-lede">
          CyberShop is a catalogue and an introduction. We help you find a real business and start a
          real conversation — then you and the seller deal with each other, the way this market has
          always worked. We never take buyer payment, never hold goods, and never sit in the middle
          of a deal.
        </p>
        <p style={{ color: 'var(--ink-dim)' }}>
          That is a feature — it is also why you have to stay sharp, the way you would at Balogun or
          Computer Village. Everything below is free, and it is the difference between a good buy and
          a bad week.
        </p>

        <SafetyTips />

        <h2 style={{ marginTop: 34 }} id="the-three-beats-of-a-safe-deal">The three beats of a safe deal</h2>
        <div className="safety-rules">
          {RULES.map((r) => (
            <article className="card panel safety-rule" key={r.n}>
              <span className="safety-rule-n" aria-hidden="true">
                {r.n}
              </span>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </article>
          ))}
        </div>

        <h2 id="what-cybershop-never-does">What CyberShop never does</h2>
        <ul className="safety-list">
          {NEVER.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="notice" style={{ marginBottom: 26 }}>
          <strong>If someone asks you to pay “CyberShop”, they are robbing you.</strong> Report the
          listing and message us at{' '}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a> — we will act on it.
        </p>

        <h2 id="red-flags-walk-away">Red flags — walk away</h2>
        <ul className="safety-list">
          {RED_FLAGS.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>

        <h2 id="if-something-goes-wrong">If something goes wrong</h2>
        <ol className="safety-list">
          {IF_IT_GOES_WRONG.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ol>

        <h2 id="for-vendors">For vendors</h2>
        <ul className="safety-list">
          <li>Use real photos of the actual item or work. Misleading ads get taken down.</li>
          <li>Price honestly. “Price on request” beats a bait figure every time.</li>
          <li>Answer on WhatsApp. Dead chats lose the market — and your ranking.</li>
          <li>Meet buyers in a public place where you can, and never collect a “CyberShop fee”.</li>
          <li>If a buyer is unhappy, fix it in the thread. Reputation is the only currency here.</li>
        </ul>

        <h2 id="our-part">Our part</h2>
        <p style={{ color: 'var(--ink-dim)' }}>
          We review reports, remove scam listings, suspend vendors who break the rules, and keep a
          record of what happened. We cannot guarantee a seller or refund a payment we never
          received — nobody can. What we can promise is that the market stays open, honest, and free
          to walk into.
        </p>
        <p style={{ color: 'var(--ink-faint)', fontSize: '0.86rem' }}>
          {safety.headline}. Questions about a listing, a payment request or a suspicious message?{' '}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a> — a human reads every one.
        </p>
      </div>
    </section>
  );
}
