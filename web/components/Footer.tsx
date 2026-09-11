export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="inner">
        <div>
          <span className="wordmark">
            Cyber<span style={{ color: 'var(--em)' }}>Shop</span>
          </span>
          <span style={{ color: 'var(--ink-faint)' }}>— Find a business. Talk to it on WhatsApp.</span>
        </div>
        <nav aria-label="Footer">
          <a href="/businesses">Browse businesses</a>
          <a href="/search">Search</a>
          <a href="/register">Sell on CyberShop</a>
          <a href="mailto:support@cybershop.ng">Support</a>
        </nav>
      </div>
    </footer>
  );
}
