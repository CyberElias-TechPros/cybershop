import type { Metadata } from 'next';
import SafetyTips from '@/components/SafetyTips';

export const metadata: Metadata = {
  title: 'How to buy and sell safely',
  description: 'CyberShop is a classifieds night market. Talk on WhatsApp. Inspect. Pay the vendor — never us.',
};

export default function SafetyPage() {
  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <span className="eyebrow">Trust &amp; safety</span>
        <h1>
          Same street rules as <em>Jiji</em>
        </h1>
        <p style={{ color: 'var(--ink-dim)', fontSize: '1.05rem' }}>
          CyberShop is a catalogue and a conversation. We never take payment from buyers, never
          hold goods, and never sit in the middle of a deal. That is a feature — and it means you
          stay sharp, the way you would at Balogun or Computer Village.
        </p>
        <SafetyTips />
        <h2>For buyers</h2>
        <ul className="safety-list">
          <li>Use the listing page and WhatsApp message as your paper trail.</li>
          <li>Ask for a live video or extra photos if anything feels off.</li>
          <li>Prefer public meetups. Tell someone where you’re going.</li>
          <li>Report fake ads — ⚑ Report on the listing. We review every one.</li>
        </ul>
        <h2>For vendors</h2>
        <ul className="safety-list">
          <li>Use real photos of the actual item. Misleading ads get taken down.</li>
          <li>Price honestly. “On request” is better than a bait figure.</li>
          <li>Reply on WhatsApp. Dead chats lose the market.</li>
          <li>Never ask a buyer to pay “CyberShop” — we will never request that.</li>
        </ul>
      </div>
    </section>
  );
}
