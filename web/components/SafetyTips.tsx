/** Jiji-style safety copy. CyberShop never takes buyer payment. */
export default function SafetyTips({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`safety-tips${compact ? ' compact' : ''}`} aria-labelledby="safety-title">
      <h2 id="safety-title">Safety tips</h2>
      <ol>
        <li>Never pay in advance — not even a “delivery fee.”</li>
        <li>Meet in a busy public place, or inspect before you transfer.</li>
        <li>Check the item is exactly what you agreed in WhatsApp.</li>
        <li>Only pay the vendor when you’re satisfied. CyberShop never holds your money.</li>
      </ol>
      {!compact && (
        <p>
          <a href="/safety">How to buy and sell safely →</a>
        </p>
      )}
    </aside>
  );
}
